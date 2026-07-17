import assert from "node:assert/strict";
import { describe, test } from "node:test";
import resolveConfig from "../../../src/plugins/whmcs-build/resolve-config.js";

describe("whmcs-build resolve-config", () => {
  test("applies defaults for a minimal configuration", () => {
    const config = resolveConfig({ archiveFileName: "whmcs-cnic-bundle" });

    assert.equal(config.archiveFileName, "whmcs-cnic-bundle");
    assert.equal(config.archiveBuildPath, "build");
    assert.deepEqual(config.filesForArchive, []);
    assert.deepEqual(config.filesForArchiveMapping, {});
    assert.equal(config.composer, false);
    assert.equal(config.logoStamp, false);
    assert.equal(config.prettier, false);
    assert.equal(config.encrypt, false);
    assert.equal(config.archive, true);
    assert.equal(config.distributionRepo, false);
  });

  test("archiveFileName is false when missing", () => {
    assert.equal(resolveConfig({}).archiveFileName, false);
  });

  test("normalizes encrypt options with defaults", () => {
    const config = resolveConfig({
      archiveFileName: "bundle",
      encrypt: {
        encoderPath: "/opt/ioncube/ioncube_encoder.sh",
        commands: ["-81 --bundle"],
      },
    });

    assert.deepEqual(config.encrypt, {
      encoderPath: "/opt/ioncube/ioncube_encoder.sh",
      commands: ["-81 --bundle"],
      files: [],
      sudo: true,
    });
  });

  test("normalizes distributionRepo options with defaults", () => {
    const config = resolveConfig({
      archiveFileName: "bundle",
      distributionRepo: { url: "https://github.com/acme/distribution.git" },
    });

    assert.deepEqual(config.distributionRepo, {
      url: "https://github.com/acme/distribution.git",
      dir: "distribution-repo",
      branch: "main",
      files: [],
      releaserc: ".releaserc.distribution.json",
      tokenEnv: "DISTRIBUTION_REPO_TOKEN",
      runSemanticRelease: true,
      commitMessage: false,
    });
  });

  test("normalizes logoStamp options with defaults", () => {
    const config = resolveConfig({
      archiveFileName: "bundle",
      logoStamp: { input: "raw_logo.png", output: "logo.png" },
    });

    assert.deepEqual(config.logoStamp, {
      input: "raw_logo.png",
      output: "logo.png",
      fontSize: 41,
      color: "grey",
      padding: 5,
    });
  });

  test("uses the semantic-release context cwd", () => {
    const config = resolveConfig(
      { archiveFileName: "bundle" },
      { cwd: "/somewhere/else", env: {} },
    );

    assert.equal(config.cwd, "/somewhere/else");
  });
});
