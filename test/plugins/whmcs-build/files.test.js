import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  cleanupPaths,
  resolveFiles,
  splitPatterns,
} from "../../../src/plugins/whmcs-build/files.js";

describe("whmcs-build files", () => {
  test("splitPatterns separates includes from negations", () => {
    assert.deepEqual(
      splitPatterns(["modules/**", "!modules/registrars/ibs/**", "LICENSE"]),
      {
        include: ["modules/**", "LICENSE"],
        ignore: ["modules/registrars/ibs/**"],
      },
    );
  });

  describe("resolveFiles", () => {
    let fixtureDir;

    beforeEach(async () => {
      fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-files-"));
      for (const file of [
        "LICENSE",
        "modules/registrars/cnic/cnic.php",
        "modules/registrars/ibs/ibs.php",
        "resources/cnic/app.js",
      ]) {
        await mkdir(path.join(fixtureDir, path.dirname(file)), {
          recursive: true,
        });
        await writeFile(path.join(fixtureDir, file), "content");
      }
    });

    afterEach(async () => {
      await rm(fixtureDir, { recursive: true, force: true });
    });

    test("matches extglob patterns and honors negations", async () => {
      const files = await resolveFiles(
        ["LICENSE", "@(modules|resources)/**", "!modules/registrars/ibs/**"],
        { cwd: fixtureDir },
      );

      assert.deepEqual(files, [
        "LICENSE",
        "modules/registrars/cnic/cnic.php",
        "resources/cnic/app.js",
      ]);
    });

    test("returns an empty list without include patterns", async () => {
      assert.deepEqual(await resolveFiles([], { cwd: fixtureDir }), []);
      assert.deepEqual(
        await resolveFiles(["!modules/**"], { cwd: fixtureDir }),
        [],
      );
    });
  });

  describe("cleanupPaths", () => {
    let fixtureDir;

    beforeEach(async () => {
      fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-cleanup-"));
      await mkdir(path.join(fixtureDir, "templates_c"), { recursive: true });
      await writeFile(path.join(fixtureDir, "templates_c/cached.tpl"), "x");
    });

    afterEach(async () => {
      await rm(fixtureDir, { recursive: true, force: true });
    });

    test("removes each configured path, recursively", async () => {
      const logger = { log() {} };
      await cleanupPaths(["templates_c", "does-not-exist"], {
        cwd: fixtureDir,
        logger,
      });

      assert.equal(existsSync(path.join(fixtureDir, "templates_c")), false);
    });

    test("does nothing without paths configured", async () => {
      await cleanupPaths([], { cwd: fixtureDir, logger: { log() {} } });
      assert.equal(existsSync(path.join(fixtureDir, "templates_c")), true);
    });
  });
});
