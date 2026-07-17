import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { getContextEnv } from "../../core/index.js";
import { resolveFiles } from "./files.js";
import getError from "./get-error.js";

const COMMIT_TYPES = { major: "chore", minor: "feat", patch: "fix" };

/**
 * Publishes release artifacts to a downstream distribution repository: clone
 * or refresh, copy the configured files, commit, push, and optionally run a
 * nested semantic-release inside that repository.
 */
export default class DistributionRepoPublisher {
  constructor(config, context) {
    this.config = config;
    this.repo = config.distributionRepo;
    this.logger = context.logger || console;
    this.env = getContextEnv(context);
    this.cwd = config.cwd;
    this.dir = path.resolve(this.cwd, this.repo.dir);
  }

  get token() {
    const token = this.env[this.repo.tokenEnv];
    if (!token) {
      throw getError("NoDistributionRepoToken");
    }
    return token;
  }

  get authenticatedUrl() {
    return this.repo.url.replace(
      "https://github.com/",
      `https://${this.token}@github.com/`,
    );
  }

  git(args, options = {}) {
    return execa("git", args, { cwd: this.dir, ...options });
  }

  async cloneOrCheckout() {
    if (existsSync(path.join(this.dir, ".git"))) {
      const { stdout: status } = await this.git(["status", "--porcelain"]);
      const { stdout: branch } = await this.git([
        "symbolic-ref",
        "--short",
        "HEAD",
      ]);

      if (branch.trim() !== this.repo.branch) {
        if (status.trim()) {
          throw new Error(
            `The distribution repository at ${this.dir} has local changes and is not on '${this.repo.branch}'.`,
          );
        }
        await this.git(["checkout", this.repo.branch]);
      }
      return;
    }

    this.logger.log("Cloning distribution repository...");
    await execa("git", ["clone", this.authenticatedUrl, this.dir], {
      cwd: this.cwd,
    });
  }

  async copyReleaseConfig() {
    const source = path.resolve(this.cwd, this.repo.releaserc);
    if (existsSync(source)) {
      await copyFile(source, path.join(this.dir, ".releaserc.json"));
    }
  }

  targetPathFor(file) {
    let target = file;

    const buildPrefix = `${this.config.archiveBuildPath}/`;
    if (target.startsWith(buildPrefix)) {
      target = target.slice(buildPrefix.length);
    }

    return target.replace(
      `${this.config.archiveFileName}-latest`,
      this.config.archiveFileName,
    );
  }

  async copyArtifacts() {
    const files = await resolveFiles(this.repo.files, { cwd: this.cwd });

    for (const file of files) {
      const target = path.join(this.dir, this.targetPathFor(file));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.resolve(this.cwd, file), target);
    }

    this.logger.log(`Copied ${files.length} artifact(s) to ${this.dir}.`);
  }

  commitMessage(nextRelease = {}) {
    if (this.repo.commitMessage) {
      return this.repo.commitMessage
        .replaceAll("${version}", nextRelease.version ?? "")
        .replaceAll("${type}", nextRelease.type ?? "")
        .replaceAll("${notes}", nextRelease.notes ?? "");
    }

    const type = COMMIT_TYPES[nextRelease.type] || "chore";
    return `${type}(release): ${nextRelease.version}`;
  }

  async commitAndPush(message) {
    await this.git(["remote", "set-url", "origin", this.authenticatedUrl]);

    const { stdout: status } = await this.git(["status", "--porcelain"]);
    if (!status.trim()) {
      this.logger.log("No changes to publish to the distribution repository.");
      return false;
    }

    await this.git(["add", "-A"]);
    await this.git(["commit", "-m", message]);
    await this.git(["fetch", "origin", "-p", "--tags", "--prune-tags", "-f"]);
    await this.git(["pull"]);
    await this.git(["push"]);
    this.logger.log("Pushed release artifacts to the distribution repository.");
    return true;
  }

  async releaseDistributionRepo(nextRelease = {}) {
    if (!this.repo.runSemanticRelease) {
      return;
    }

    const semanticRelease = (await import("semantic-release")).default;
    this.logger.log(
      "Running semantic-release in the distribution repository...",
    );

    const result = await semanticRelease(
      {
        branches: [this.repo.branch],
        repositoryUrl: this.repo.url,
      },
      {
        cwd: this.dir,
        env: {
          ...this.env,
          customReleaseNotes: nextRelease.notes || "",
          GH_TOKEN: this.token,
        },
      },
    );

    if (result) {
      this.logger.log(
        `Published ${result.nextRelease.type} release version ${result.nextRelease.version} to the distribution repository.`,
      );
    } else {
      this.logger.log("No release published in the distribution repository.");
    }
  }

  async publish(nextRelease) {
    await this.cloneOrCheckout();
    await this.copyReleaseConfig();
    await this.copyArtifacts();
    await this.commitAndPush(this.commitMessage(nextRelease));
    await this.releaseDistributionRepo(nextRelease);
  }
}
