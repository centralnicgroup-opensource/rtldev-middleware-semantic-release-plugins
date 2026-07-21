import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import WhmcsBuildPlugin, {
  createStandaloneContext,
} from "../../../src/plugins/whmcs-build/plugin.js";

const logger = { log() {}, error() {} };

function createContext(overrides = {}) {
  return {
    logger,
    env: {},
    nextRelease: { type: "minor", version: "2.1.0", notes: "notes" },
    ...overrides,
  };
}

async function assertVerifyFailsWith(pluginConfig, context, code) {
  const plugin = new WhmcsBuildPlugin();
  await assert.rejects(
    plugin.verifyConditions(pluginConfig, context),
    (error) => {
      const errors = error.errors ?? [error];
      assert.ok(
        errors.some((inner) => inner.code === code),
        `expected error code ${code}, got ${errors.map((e) => e.code)}`,
      );
      return true;
    },
  );
}

describe("whmcs-build plugin", () => {
  let fixtureDir;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-plugin-"));
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  describe("verifyConditions", () => {
    test("fails without archiveFileName", async () => {
      await assertVerifyFailsWith(
        {},
        createContext(),
        "ArchiveFileNameRequired",
      );
    });

    test("fails when encryption misses encoder path and commands", async () => {
      await assertVerifyFailsWith(
        { archiveFileName: "bundle", encrypt: {} },
        createContext(),
        "EncoderPathRequired",
      );
      await assertVerifyFailsWith(
        { archiveFileName: "bundle", encrypt: { encoderPath: "/x" } },
        createContext(),
        "EncoderCommandsRequired",
      );
    });

    test("fails when the configured encoder does not exist", async () => {
      await assertVerifyFailsWith(
        {
          archiveFileName: "bundle",
          encrypt: {
            encoderPath: path.join(fixtureDir, "missing.sh"),
            commands: ["-81"],
          },
        },
        createContext({ cwd: fixtureDir }),
        "EncoderNotFound",
      );
    });

    test("fails when the distribution repository token is missing", async () => {
      await assertVerifyFailsWith(
        {
          archiveFileName: "bundle",
          distributionRepo: {
            url: "https://github.com/acme/distribution.git",
          },
        },
        createContext({ cwd: fixtureDir }),
        "NoDistributionRepoToken",
      );
    });

    test("fails when distributionRepo has no url", async () => {
      await assertVerifyFailsWith(
        { archiveFileName: "bundle", distributionRepo: {} },
        createContext(),
        "DistributionRepoUrlRequired",
      );
    });

    test("passes with a minimal valid configuration", async () => {
      const plugin = new WhmcsBuildPlugin();
      await plugin.verifyConditions(
        { archiveFileName: "bundle" },
        createContext({ cwd: fixtureDir }),
      );
      assert.equal(plugin.verified, true);
    });
  });

  describe("prepare", () => {
    test("builds the bundle end to end without encryption", async () => {
      for (const [file, content] of [
        ["LICENSE", "license"],
        ["README.public.md", "# readme"],
        ["modules/registrars/cnic/cnic.php", "<?php echo 1;"],
      ]) {
        await mkdir(path.join(fixtureDir, path.dirname(file)), {
          recursive: true,
        });
        await writeFile(path.join(fixtureDir, file), content);
      }

      const plugin = new WhmcsBuildPlugin();
      await plugin.prepare(
        {
          archiveFileName: "whmcs-cnic-bundle",
          filesForArchive: ["LICENSE", "README.public.md", "modules/**"],
        },
        createContext({ cwd: fixtureDir }),
      );

      assert.ok(existsSync(path.join(fixtureDir, "build/README.md")));
      assert.ok(
        existsSync(path.join(fixtureDir, "whmcs-cnic-bundle-latest.zip")),
      );
    });
  });

  describe("publish", () => {
    test("skips without a distribution repository configured", async () => {
      const plugin = new WhmcsBuildPlugin();
      await plugin.publish(
        { archiveFileName: "bundle" },
        createContext({ cwd: fixtureDir }),
      );
    });
  });

  describe("build", () => {
    test("builds the bundle from plain options, no context object required", async () => {
      await mkdir(path.join(fixtureDir, "modules/registrars/cnic"), {
        recursive: true,
      });
      await writeFile(path.join(fixtureDir, "LICENSE"), "license");

      const plugin = new WhmcsBuildPlugin();
      await plugin.build(
        { archiveFileName: "whmcs-cnic-bundle", filesForArchive: ["LICENSE"] },
        { cwd: fixtureDir, logger },
      );

      assert.ok(
        existsSync(path.join(fixtureDir, "whmcs-cnic-bundle-latest.zip")),
      );
    });
  });

  describe("release", () => {
    test("runs prepare then publish for a standalone, manually-versioned release", async () => {
      for (const [file, content] of [
        ["LICENSE", "license"],
        ["modules/registrars/cnic/cnic.php", "<?php echo 1;"],
      ]) {
        await mkdir(path.join(fixtureDir, path.dirname(file)), {
          recursive: true,
        });
        await writeFile(path.join(fixtureDir, file), content);
      }

      const plugin = new WhmcsBuildPlugin();
      await plugin.release(
        {
          archiveFileName: "whmcs-tpp-registrar",
          filesForArchive: ["LICENSE", "modules/**"],
        },
        {
          version: "1.2.3",
          type: "minor",
          notes: "notes",
          cwd: fixtureDir,
          env: {},
          logger,
        },
      );

      assert.ok(
        existsSync(path.join(fixtureDir, "whmcs-tpp-registrar-latest.zip")),
      );
    });
  });
});

describe("createStandaloneContext", () => {
  test("builds a semantic-release-shaped context from plain options", () => {
    const context = createStandaloneContext({
      version: "1.0.0",
      type: "patch",
      notes: "fixed things",
      repositoryUrl: "https://github.com/acme/example.git",
      cwd: "/tmp/example",
      env: { FOO: "bar" },
      logger,
    });

    assert.deepEqual(context, {
      cwd: "/tmp/example",
      env: { FOO: "bar" },
      logger,
      options: { repositoryUrl: "https://github.com/acme/example.git" },
      nextRelease: { version: "1.0.0", type: "patch", notes: "fixed things" },
    });
  });

  test("defaults cwd/env/logger and empty notes when omitted", () => {
    const context = createStandaloneContext({
      version: "1.0.0",
      type: "patch",
    });

    assert.equal(context.cwd, process.cwd());
    assert.equal(context.env, process.env);
    assert.equal(context.logger, console);
    assert.equal(context.nextRelease.notes, "");
  });
});
