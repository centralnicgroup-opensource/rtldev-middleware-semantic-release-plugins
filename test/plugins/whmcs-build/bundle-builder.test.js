import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import BundleBuilder from "../../../src/plugins/whmcs-build/bundle-builder.js";
import resolveConfig from "../../../src/plugins/whmcs-build/resolve-config.js";

const logger = { log() {}, error() {} };

describe("whmcs-build BundleBuilder", () => {
  let fixtureDir;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-builder-"));
    for (const [file, content] of [
      ["LICENSE", "license"],
      ["README.public.md", "# readme"],
      ["modules/registrars/cnic/cnic.php", "<?php echo 1;"],
      ["release.json", '{ "a":1 }'],
      [".htaccess_sample", "deny"],
    ]) {
      await mkdir(path.join(fixtureDir, path.dirname(file)), {
        recursive: true,
      });
      await writeFile(path.join(fixtureDir, file), content);
    }
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  function createBuilder(overrides = {}) {
    const config = resolveConfig(
      {
        archiveFileName: "whmcs-cnic-bundle",
        filesForArchive: ["LICENSE", "README.public.md", "modules/**"],
        filesForArchiveMapping: { ".htaccess_sample": ["docs", "extra"] },
        ...overrides,
      },
      { cwd: fixtureDir, env: {} },
    );
    return new BundleBuilder(config, logger);
  }

  test("copyFiles strips the .public suffix from basenames", async () => {
    const builder = createBuilder();
    await builder.copyFiles();

    assert.ok(existsSync(path.join(fixtureDir, "build/LICENSE")));
    assert.ok(existsSync(path.join(fixtureDir, "build/README.md")));
    assert.ok(
      existsSync(
        path.join(fixtureDir, "build/modules/registrars/cnic/cnic.php"),
      ),
    );
    assert.ok(!existsSync(path.join(fixtureDir, "build/README.public.md")));
  });

  test("copyMappings copies sources into each destination", async () => {
    const builder = createBuilder();
    await builder.copyMappings();

    assert.ok(existsSync(path.join(fixtureDir, "build/docs/.htaccess_sample")));
    assert.ok(
      existsSync(path.join(fixtureDir, "build/extra/.htaccess_sample")),
    );
  });

  test("clean removes the build directory and previous archive", async () => {
    const builder = createBuilder();
    await builder.copyFiles();
    await writeFile(
      path.join(fixtureDir, "whmcs-cnic-bundle-latest.zip"),
      "old",
    );

    await builder.clean();

    assert.ok(!existsSync(path.join(fixtureDir, "build")));
    assert.ok(
      !existsSync(path.join(fixtureDir, "whmcs-cnic-bundle-latest.zip")),
    );
  });

  test("buildArchive writes a zip of the build directory", async () => {
    const builder = createBuilder();
    await builder.copyFiles();
    await builder.buildArchive();

    const archive = await readFile(
      path.join(fixtureDir, "whmcs-cnic-bundle-latest.zip"),
    );
    assert.equal(archive.subarray(0, 2).toString(), "PK");
  });

  test("formatWithPrettier formats matching build output", async () => {
    const builder = createBuilder({
      filesForArchive: ["release.json"],
      prettier: { files: ["build/**/*.json"] },
    });
    await builder.copyFiles();
    await builder.formatWithPrettier();

    const formatted = await readFile(
      path.join(fixtureDir, "build/release.json"),
      "utf8",
    );
    assert.equal(formatted, '{ "a": 1 }\n');
  });
});
