import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("clones the repository when no local checkout exists", async () => {
    const publisher = createPublisher();
    await publisher.cloneOrCheckout();

    const { stdout: branch } = await git(publisher.dir, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]);
    assert.equal(branch.trim(), "main");
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
});
