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
      `https://${encodeURIComponent(this.token)}@github.com/`,
    );
  }

  git(args, options = {}) {
    return execa("git", args, { cwd: this.dir, ...options });
  }

  async withAuthenticatedRemote(work) {
    try {
      try {
        await this.git(["remote", "set-url", "origin", this.authenticatedUrl]);
      } catch {
        throw new Error("Failed to configure distribution authentication.");
      }
      return await work();
    } finally {
      await this.git(["remote", "set-url", "origin", this.repo.url]);
    }
  }

  async cloneOrCheckout() {
    if (!existsSync(path.join(this.dir, ".git"))) {
      this.logger.log("Cloning distribution repository...");
      try {
        await execa("git", ["clone", this.authenticatedUrl, this.dir], {
          cwd: this.cwd,
        });
      } catch {
        throw new Error(
          `Failed to clone the distribution repository into ${this.dir}.`,
        );
      } finally {
        if (existsSync(path.join(this.dir, ".git"))) {
          await this.git(["remote", "set-url", "origin", this.repo.url]);
        }
      }
      return;
    }

    const { stdout: status } = await this.git(["status", "--porcelain"]);
    if (status.trim()) {
      throw new Error(
        `The distribution repository at ${this.dir} has local changes; refusing to switch it to '${this.repo.branch}'.`,
      );
    }

    // A prior step (e.g. actions/checkout) may have already fetched this
    // repository, typically onto a detached HEAD rather than a real branch.
    // Fetch the target branch explicitly and force-create a local branch
    // tracking it, which is safe whether we start detached, on the right
    // branch already, or on some other branch entirely.
    await this.withAuthenticatedRemote(() =>
      this.git(["fetch", "origin", this.repo.branch]),
    );
    await this.git([
      "checkout",
      "-B",
      this.repo.branch,
      `origin/${this.repo.branch}`,
    ]);
  }

  async copyReleaseConfig() {
    const source = path.resolve(this.cwd, this.repo.releaserc);
    if (!existsSync(source)) {
      if (this.repo.runSemanticRelease) {
        throw new Error(
          `Distribution release config was not found: ${this.repo.releaserc}`,
        );
      }
      return;
    }
    await copyFile(source, path.join(this.dir, ".releaserc.json"));
  }

  stripBuildPrefix(file) {
    const buildPrefix = `${this.config.archiveBuildPath}/`;
    return file.startsWith(buildPrefix) ? file.slice(buildPrefix.length) : file;
  }

  async copyArtifacts() {
    let copied = 0;

    for (const { from, to } of this.repo.files) {
      const matches = await resolveFiles([from], { cwd: this.cwd });
      if (!matches.length) {
        throw new Error(
          `Required distribution artifact pattern matched no files: ${from}`,
        );
      }
      for (const file of matches) {
        // An explicit `to` renames the file (e.g. dropping the "-latest"
        // suffix for the public cnic bundle); bare entries keep their name.
        // Either way the build/ prefix is stripped so files land at the repo
        // root. `to` is meant for single-file entries, not multi-match globs.
        const target = path.join(this.dir, this.stripBuildPrefix(to ?? file));
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.resolve(this.cwd, file), target);
        copied += 1;
      }
    }

    this.logger.log(`Copied ${copied} artifact(s) to ${this.dir}.`);
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
    const { stdout: status } = await this.git(["status", "--porcelain"]);
    if (!status.trim()) {
      this.logger.log("No changes to publish to the distribution repository.");
      return false;
    }

    await this.git(["add", "-A"]);
    await this.git(["commit", "-m", message]);

    await this.withAuthenticatedRemote(async () => {
      // cloneOrCheckout() starts from the current remote branch. Push directly
      // so a concurrent update fails safely instead of creating a merge commit.
      await this.git(["push"]);
    });
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
    const pushed = await this.commitAndPush(this.commitMessage(nextRelease));
    if (pushed) {
      await this.releaseDistributionRepo(nextRelease);
    }
  }
}
