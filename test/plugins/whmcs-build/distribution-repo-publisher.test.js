import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { execa } from "execa";
import DistributionRepoPublisher from "../../../src/plugins/whmcs-build/distribution-repo-publisher.js";
import resolveConfig from "../../../src/plugins/whmcs-build/resolve-config.js";

const logger = { log() {}, error() {} };

async function git(cwd, args) {
  return execa("git", args, { cwd });
}

async function initBareRepo(cwd) {
  await git(cwd, ["init", "--bare", "--initial-branch=main", "origin.git"]);
}

async function seedRepoFromRemote(cwd, remoteUrl) {
  const seedDir = path.join(cwd, "seed");
  await mkdir(seedDir, { recursive: true });
  await git(seedDir, ["init", "--initial-branch=main"]);
  await git(seedDir, ["config", "user.email", "test@example.com"]);
  await git(seedDir, ["config", "user.name", "Test"]);
  await writeFile(path.join(seedDir, "README.md"), "seed");
  await git(seedDir, ["add", "-A"]);
  await git(seedDir, ["commit", "-m", "initial"]);
  await git(seedDir, ["remote", "add", "origin", remoteUrl]);
  await git(seedDir, ["push", "origin", "main"]);
}

describe("whmcs-build DistributionRepoPublisher", () => {
  let workDir;
  let remoteUrl;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-distrepo-"));
    remoteUrl = path.join(workDir, "origin.git");
    await initBareRepo(workDir);
    await seedRepoFromRemote(workDir, remoteUrl);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function createPublisher() {
    const env = { DISTRIBUTION_REPO_TOKEN: "unused" };
    const config = resolveConfig(
      {
        archiveFileName: "bundle",
        distributionRepo: { url: remoteUrl, dir: "checkout" },
      },
      { cwd: workDir, env },
    );
    return new DistributionRepoPublisher(config, { logger, env });
  }

  test("writes conventional downstream commits with the configured scope", () => {
    const publisher = createPublisher();
    assert.equal(
      publisher.commitMessage({ type: "patch", version: "1.2.3" }),
      "fix(release): publish 1.2.3",
    );

    publisher.repo.commitScope = "ibs-moniker";

    assert.equal(
      publisher.commitMessage({ type: "patch", version: "5.5.10" }),
      "fix(ibs-moniker): publish 5.5.10",
    );
    assert.equal(
      publisher.commitMessage({ type: "major", version: "6.0.0" }),
      "feat(ibs-moniker): publish 6.0.0\n\nBREAKING CHANGE: publish the new major distribution version.",
    );
  });

  test("clones the repository when no local checkout exists", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();

    const { stdout: branch } = await git(publisher.dir, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]);
    assert.equal(branch.trim(), "main");
    const { stdout: origin } = await git(publisher.dir, [
      "remote",
      "get-url",
      "origin",
    ]);
    assert.equal(origin, remoteUrl);
  });

  test("recovers a checkout left in detached HEAD by a prior step", async () => {
    // Simulate actions/checkout: clone, then detach HEAD at the current commit.
    await execa("git", ["clone", remoteUrl, "checkout"], { cwd: workDir });
    const checkoutDir = path.join(workDir, "checkout");
    await git(checkoutDir, ["checkout", "--detach", "HEAD"]);

    const { stdout: headState } = await git(checkoutDir, ["status"]);
    assert.match(headState, /HEAD detached/);

    const publisher = createPublisher();
    await publisher.cloneOrCheckout();

    const { stdout: branch } = await git(publisher.dir, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]);
    assert.equal(branch.trim(), "main");
  });

  test("refuses to switch branches when the checkout has local changes", async () => {
    await execa("git", ["clone", remoteUrl, "checkout"], { cwd: workDir });
    const checkoutDir = path.join(workDir, "checkout");
    await git(checkoutDir, ["checkout", "--detach", "HEAD"]);
    await writeFile(path.join(checkoutDir, "dirty.txt"), "uncommitted");

    const publisher = createPublisher();
    await assert.rejects(publisher.cloneOrCheckout(), /local changes/);
  });

  test("requires the downstream release config when semantic-release is enabled", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();
    await assert.rejects(
      publisher.copyReleaseConfig(),
      /release config was not found/,
    );
  });

  test("preserves a JavaScript config extension and removes the stale JSON config", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();
    publisher.repo.releaserc = ".releaserc.public.mjs";
    await writeFile(
      path.join(workDir, ".releaserc.public.mjs"),
      "export default {};\n",
    );
    await writeFile(path.join(publisher.dir, ".releaserc.json"), "{}\n");

    await publisher.copyReleaseConfig();

    assert.ok(existsSync(path.join(publisher.dir, ".releaserc.mjs")));
    assert.ok(!existsSync(path.join(publisher.dir, ".releaserc.json")));
  });

  test("restores the clean remote URL after pushing", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();
    await git(publisher.dir, ["config", "user.email", "test@example.com"]);
    await git(publisher.dir, ["config", "user.name", "Test"]);
    await writeFile(path.join(publisher.dir, "release.txt"), "release");
    Object.defineProperty(publisher, "authenticatedUrl", {
      value: `file://${remoteUrl}`,
    });

    assert.equal(await publisher.commitAndPush("fix: release"), true);
    const { stdout: origin } = await git(publisher.dir, [
      "remote",
      "get-url",
      "origin",
    ]);
    assert.equal(origin, remoteUrl);
  });

  test("copies release support files beside the downstream config", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();
    publisher.repo.releaseConfigFiles = ["release-products.json"];
    await writeFile(path.join(workDir, "release-products.json"), "{}\n");

    await publisher.copyReleaseConfigFiles();

    assert.equal(
      await readFile(path.join(publisher.dir, "release-products.json"), "utf8"),
      "{}\n",
    );
  });

  test("does not publish transient release configuration files", async () => {
    const publisher = createPublisher();
    publisher.repo.releaserc = ".releaserc.public.mjs";
    publisher.repo.releaseConfigFiles = ["release-products.json"];
    publisher.repo.runSemanticRelease = false;
    publisher.repo.files = [{ from: "bundle-latest.zip", to: null }];

    await writeFile(
      path.join(workDir, ".releaserc.public.mjs"),
      "export default {};\n",
    );
    await writeFile(path.join(workDir, "release-products.json"), "{}\n");
    await writeFile(path.join(workDir, "bundle-latest.zip"), "zip\n");
    await publisher.cloneOrCheckout();
    await git(publisher.dir, ["config", "user.email", "test@example.com"]);
    await git(publisher.dir, ["config", "user.name", "Test"]);

    await publisher.publish({ version: "1.0.0", type: "patch" });

    assert.ok(existsSync(path.join(publisher.dir, "bundle-latest.zip")));
    assert.ok(!existsSync(path.join(publisher.dir, ".releaserc.mjs")));
    assert.ok(!existsSync(path.join(publisher.dir, "release-products.json")));
    const { stdout: status } = await git(publisher.dir, [
      "status",
      "--porcelain",
    ]);
    assert.equal(status.trim(), "");
  });

  test("does not push distribution artifacts when downstream release fails", async () => {
    const publisher = createPublisher();
    publisher.repo.releaserc = ".releaserc.public.mjs";
    publisher.repo.releaseConfigFiles = ["release-products.json"];
    publisher.repo.files = [{ from: "bundle-latest.zip", to: null }];
    publisher.releaseDistributionRepo = async () => {
      throw new Error("downstream release failed");
    };

    await writeFile(
      path.join(workDir, ".releaserc.public.mjs"),
      "export default {};\n",
    );
    await writeFile(path.join(workDir, "release-products.json"), "{}\n");
    await writeFile(path.join(workDir, "bundle-latest.zip"), "zip\n");
    await publisher.cloneOrCheckout();
    await git(publisher.dir, ["config", "user.email", "test@example.com"]);
    await git(publisher.dir, ["config", "user.name", "Test"]);

    await assert.rejects(
      publisher.publish({ version: "1.0.0", type: "patch" }),
      /downstream release failed/,
    );

    const verifyDir = path.join(workDir, "verify");
    await execa("git", ["clone", remoteUrl, verifyDir]);
    assert.ok(!existsSync(path.join(verifyDir, "bundle-latest.zip")));
  });

  test("exposes nested release selectors while loading its config", async () => {
    const publisher = createPublisher();
    const original = process.env.RELEASE_REPOSITORY;
    process.env.RELEASE_REPOSITORY = "private";
    let selectedRepository;

    await publisher.withProcessEnv(
      {
        RELEASE_REPOSITORY: "public",
        SOURCE_RELEASE_VERSION: "1.0.0",
      },
      async () => {
        selectedRepository = process.env.RELEASE_REPOSITORY;
        assert.equal(process.env.SOURCE_RELEASE_VERSION, "1.0.0");
      },
    );

    assert.equal(selectedRepository, "public");
    assert.equal(process.env.RELEASE_REPOSITORY, "private");
    if (original === undefined) {
      delete process.env.RELEASE_REPOSITORY;
    } else {
      process.env.RELEASE_REPOSITORY = original;
    }
    delete process.env.SOURCE_RELEASE_VERSION;
  });

  test("skips downstream semantic-release when no artifacts changed", async () => {
    const publisher = createPublisher();
    let released = false;
    publisher.cloneOrCheckout = async () => {};
    publisher.copyReleaseConfig = async () => {};
    publisher.copyArtifacts = async () => {};
    publisher.commitChanges = async () => false;
    publisher.releaseDistributionRepo = async () => {
      released = true;
    };

    await publisher.publish({ version: "1.0.0", type: "patch" });
    assert.equal(released, false);
  });

  describe("copyArtifacts", () => {
    async function copyWith(files) {
      for (const name of [
        "whmcs-cnic-bundle-latest.zip",
        "whmcs-ibs-registrar-latest.zip",
      ]) {
        await writeFile(path.join(workDir, name), "zip");
      }
      await mkdir(path.join(workDir, "build"), { recursive: true });
      await writeFile(path.join(workDir, "build/HISTORY.md"), "history");

      const env = { DISTRIBUTION_REPO_TOKEN: "unused" };
      const config = resolveConfig(
        {
          archiveFileName: "whmcs-cnic-bundle",
          distributionRepo: { url: remoteUrl, dir: "checkout", files },
        },
        { cwd: workDir, env },
      );
      const publisher = new DistributionRepoPublisher(config, { logger, env });
      await publisher.cloneOrCheckout();
      await publisher.copyArtifacts();
      return publisher.dir;
    }

    test("renames a { from, to } entry, drops the build/ prefix, and keeps bare names", async () => {
      const dir = await copyWith([
        { from: "whmcs-cnic-bundle-latest.zip", to: "whmcs-cnic-bundle.zip" },
        "whmcs-ibs-registrar-latest.zip",
        "build/HISTORY.md",
      ]);

      // { from, to }: renamed (‑latest dropped).
      assert.ok(existsSync(path.join(dir, "whmcs-cnic-bundle.zip")));
      assert.ok(!existsSync(path.join(dir, "whmcs-cnic-bundle-latest.zip")));
      // bare string: name kept verbatim, including ‑latest (matches old gulp).
      assert.ok(existsSync(path.join(dir, "whmcs-ibs-registrar-latest.zip")));
      // build/ prefix stripped so it lands at the repo root.
      assert.ok(existsSync(path.join(dir, "HISTORY.md")));
      assert.ok(!existsSync(path.join(dir, "build/HISTORY.md")));
    });

    test("rejects a missing required artifact", async () => {
      await assert.rejects(
        copyWith(["missing.zip"]),
        /Required distribution artifact pattern matched no files/,
      );
    });
  });
});
