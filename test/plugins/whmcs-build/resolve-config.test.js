import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import resolveConfig from "../../../src/plugins/whmcs-build/resolve-config.js";

describe("whmcs-build resolve-config", () => {
  test("applies defaults for a minimal configuration", () => {
    const config = resolveConfig({ archiveFileName: "whmcs-cnic-bundle" });

    assert.equal(config.archiveFileName, "whmcs-cnic-bundle");
    assert.equal(config.archiveSuffix, "-latest");
    assert.equal(config.archiveBuildPath, "build");
    assert.deepEqual(config.filesForArchive, []);
    assert.deepEqual(config.filesForArchiveMapping, {});
    assert.equal(config.composer, false);
    assert.equal(config.logoStamp, false);
    assert.equal(config.prettier, false);
    assert.equal(config.encrypt, false);
    assert.equal(config.beforeBuild, false);
    assert.equal(config.archive, true);
    assert.equal(config.distributionRepo, false);
  });

  test("archiveFileName is false when missing", () => {
    assert.equal(resolveConfig({}).archiveFileName, false);
  });

  test("allows a product to keep its archive name without a suffix", () => {
    assert.equal(
      resolveConfig({ archiveFileName: "whmcs-cnic-bundle", archiveSuffix: "" })
        .archiveSuffix,
      "",
    );
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

  test("normalizes a Composer script", () => {
    assert.deepEqual(
      resolveConfig({ composer: { script: "./composer.sh", module: "ibs" } })
        .composer,
      { script: "./composer.sh", module: "ibs" },
    );
  });

  test("normalizes a pre-build command", () => {
    assert.deepEqual(
      resolveConfig({
        archiveFileName: "bundle",
        beforeBuild: { command: "./generate.sh", args: ["brand"] },
      }).beforeBuild,
      { command: "./generate.sh", args: ["brand"] },
    );
  });

  test("normalizes multiple builds independently", () => {
    const config = resolveConfig({
      builds: [
        { archiveFileName: "first" },
        { archiveFileName: "second", composer: false },
      ],
    });

    assert.deepEqual(
      config.builds.map(({ archiveFileName }) => archiveFileName),
      ["first", "second"],
    );
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
      releaseTarget: false,
      commitScope: "release",
      commitMessage: false,
      releaseConfigFiles: [],
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

  describe("configFile", () => {
    let fixtureDir;

    beforeEach(async () => {
      fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-cfgfile-"));
      await writeFile(
        path.join(fixtureDir, "release-config.json"),
        JSON.stringify({
          archiveFileName: "whmcs-cnic-bundle",
          archiveBuildPath: "build",
          filesForArchive: ["LICENSE"],
          encrypt: {
            encoderPath: "/enc",
            commands: ["-81"],
            files: ["**/*.php"],
          },
          // a key the plugin doesn't know about is ignored, not an error
          bundle: { directories: {} },
        }),
      );
    });

    afterEach(async () => {
      await rm(fixtureDir, { recursive: true, force: true });
    });

    test("loads options from the referenced JSON file", () => {
      const config = resolveConfig(
        { configFile: "release-config.json" },
        { cwd: fixtureDir, env: {} },
      );

      assert.equal(config.archiveFileName, "whmcs-cnic-bundle");
      assert.deepEqual(config.filesForArchive, ["LICENSE"]);
      assert.equal(config.encrypt.encoderPath, "/enc");
      assert.deepEqual(config.encrypt.files, ["**/*.php"]);
    });

    test("inline options override the config file", () => {
      const config = resolveConfig(
        { configFile: "release-config.json", archiveFileName: "override" },
        { cwd: fixtureDir, env: {} },
      );

      assert.equal(config.archiveFileName, "override");
      // non-overridden keys still come from the file
      assert.deepEqual(config.filesForArchive, ["LICENSE"]);
    });

    test("loads named profiles as one build configuration", async () => {
      await writeFile(
        path.join(fixtureDir, "release-config.json"),
        JSON.stringify({
          archiveFileName: "base",
          composer: { script: "./composer.sh" },
          profiles: {
            ibs: {
              archiveFileName: "ibs",
              filesForArchive: ["ibs/**"],
            },
            moniker: {
              archiveFileName: "moniker",
              beforeBuild: { command: "./generate.sh", args: ["moniker"] },
            },
          },
        }),
      );

      const config = resolveConfig(
        {
          configFile: "release-config.json",
          profiles: ["ibs", "moniker"],
          distributionRepo: {
            url: "https://github.com/acme/distribution.git",
          },
        },
        { cwd: fixtureDir, env: {} },
      );

      assert.deepEqual(
        config.builds.map(({ archiveFileName }) => archiveFileName),
        ["ibs", "moniker"],
      );
      assert.equal(config.builds[0].composer.module, "ibs");
      assert.equal(config.builds[1].composer.module, "moniker");
      assert.equal(config.builds[1].beforeBuild.command, "./generate.sh");
      assert.equal(
        config.builds[0].distributionRepo.url,
        "https://github.com/acme/distribution.git",
      );
      assert.equal(config.builds[1].distributionRepo, false);
    });
  });
});
