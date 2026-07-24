import { existsSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { getContextEnv } from "../../core/index.js";
import { resolveFiles } from "./files.js";
import getError from "./get-error.js";

const COMMIT_TYPES = { major: "feat", minor: "feat", patch: "fix" };

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
    this.transientConfigFiles = new Set();
    this.artifactFiles = new Set();
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

    const extension = path.extname(source);
    const targetName = [".js", ".cjs", ".mjs"].includes(extension)
      ? `.releaserc${extension}`
      : ".releaserc.json";

    // Release configuration is needed only while nested semantic-release is
    // running. Remove any previously tracked config and keep every generated
    // config transient so it is never published to the distribution repo.
    const configFiles = [
      ".releaserc.json",
      ".releaserc.js",
      ".releaserc.cjs",
      ".releaserc.mjs",
    ];
    for (const name of configFiles) {
      await this.untrackTransientFile(name);
      await rm(path.join(this.dir, name), { force: true });
    }
    this.transientConfigFiles.add(targetName);
    await copyFile(source, path.join(this.dir, targetName));
  }

  async copyReleaseConfigFiles() {
    for (const entry of this.repo.releaseConfigFiles || []) {
      const { from, to } =
        typeof entry === "string" ? { from: entry, to: null } : entry;
      const source = path.resolve(this.cwd, from);
      if (!existsSync(source)) {
        throw new Error(`Distribution support file was not found: ${from}`);
      }

      const target = path.join(this.dir, to ?? from);
      await mkdir(path.dirname(target), { recursive: true });
      const relativeTarget = to ?? from;
      await this.untrackTransientFile(relativeTarget);
      this.transientConfigFiles.add(relativeTarget);
      await copyFile(source, target);
    }
  }

  async untrackTransientFile(file) {
    await this.git(["rm", "--cached", "--ignore-unmatch", "--", file]);
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
        // An explicit `to` renames the file (for example, dropping a
        // `-latest` suffix); bare entries keep their name.
        // Either way the build/ prefix is stripped so files land at the repo
        // root. `to` is meant for single-file entries, not multi-match globs.
        const target = path.join(this.dir, this.stripBuildPrefix(to ?? file));
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.resolve(this.cwd, file), target);
        this.artifactFiles.add(this.stripBuildPrefix(to ?? file));
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
    const title = `${type}(${this.repo.commitScope}): publish ${nextRelease.version}`;
    const footer =
      nextRelease.type === "major"
        ? "BREAKING CHANGE: publish the new major distribution version."
        : "";
    return [title, nextRelease.notes || "", footer]
      .filter(Boolean)
      .join("\n\n");
  }

  async commitAndPush(message) {
    const { stdout: status } = await this.git(["status", "--porcelain"]);
    if (!status.trim()) {
      this.logger.log("No changes to publish to the distribution repository.");
      return false;
    }

    if (this.artifactFiles.size) {
      await this.git(["add", "--", ...this.artifactFiles]);
    } else {
      // Keep the low-level helper useful for callers that stage their own
      // files directly; normal publish flows stage only copied artifacts.
      await this.git(["add", "-A"]);
    }

    const { stdout: staged } = await this.git([
      "diff",
      "--cached",
      "--name-only",
    ]);
    if (!staged.trim()) {
      this.logger.log("No changes to publish to the distribution repository.");
      return false;
    }

    await this.git(["commit", "-m", message]);

    await this.withAuthenticatedRemote(async () => {
      // cloneOrCheckout() starts from the current remote branch. Push directly
      // so a concurrent update fails safely instead of creating a merge commit.
      await this.git(["push"]);
    });
    this.logger.log("Pushed release artifacts to the distribution repository.");
    return true;
  }

  async withProcessEnv(values, work) {
    const previous = new Map();
    for (const [name, value] of Object.entries(values)) {
      previous.set(name, process.env[name]);
      if (value === undefined || value === null) {
        delete process.env[name];
      } else {
        process.env[name] = String(value);
      }
    }

    try {
      return await work();
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  }

  async releaseDistributionRepo(nextRelease = {}) {
    if (!this.repo.runSemanticRelease) {
      return;
    }

    const semanticRelease = (await import("semantic-release")).default;
    this.logger.log(
      "Running semantic-release in the distribution repository...",
    );

    const releaseEnv = {
      ...this.env,
      customReleaseNotes: nextRelease.notes || "",
      ...(this.repo.releaseTarget
        ? { RELEASE_TARGET: this.repo.releaseTarget }
        : {}),
      RELEASE_REPOSITORY: "public",
      SOURCE_RELEASE_VERSION: nextRelease.version,
      GH_TOKEN: this.token,
    };
    const result = await this.withProcessEnv(releaseEnv, () =>
      semanticRelease(
        {
          branches: [this.repo.branch],
          repositoryUrl: this.repo.url,
        },
        {
          cwd: this.dir,
          env: releaseEnv,
        },
      ),
    );

    if (result) {
      this.logger.log(
        `Published ${result.nextRelease.type} release version ${result.nextRelease.version} to the distribution repository.`,
      );
    } else {
      throw new Error(
        `No distribution release was calculated for source version ${nextRelease.version}.`,
      );
    }
  }

  async publish(nextRelease) {
    try {
      await this.cloneOrCheckout();
      await this.copyReleaseConfig();
      await this.copyReleaseConfigFiles();
      await this.copyArtifacts();
      const pushed = await this.commitAndPush(this.commitMessage(nextRelease));
      if (pushed) {
        await this.releaseDistributionRepo(nextRelease);
      }
    } finally {
      for (const file of this.transientConfigFiles) {
        await rm(path.join(this.dir, file), { force: true, recursive: true });
      }
    }
  }
}
