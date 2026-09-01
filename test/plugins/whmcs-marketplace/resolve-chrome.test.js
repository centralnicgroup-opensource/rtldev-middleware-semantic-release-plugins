import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import resolveChromeExecutable, {
  browserRelativePaths,
  chromeCandidates,
} from "../../../src/plugins/whmcs-marketplace/resolve-chrome.js";

const NO_PUPPETEER = {
  executablePath() {
    throw new Error("puppeteer has no browser configured");
  },
};

describe("whmcs-marketplace resolve-chrome", () => {
  describe("browserRelativePaths", () => {
    test("linux", () => {
      assert.deepEqual(browserRelativePaths("linux"), [
        "chrome-linux64/chrome",
      ]);
    });

    test("windows", () => {
      assert.deepEqual(browserRelativePaths("win32"), [
        "chrome-win64/chrome.exe",
        "chrome-win32/chrome.exe",
      ]);
    });

    test("macOS prefers the arm64 build", () => {
      assert.match(browserRelativePaths("darwin")[0], /chrome-mac-arm64/);
    });
  });

  describe("chromeCandidates", () => {
    test("offers the newest download first", () => {
      const candidates = chromeCandidates(
        "/cache",
        ["linux-140.0.1", "linux-141.0.2", "linux-139.0.0"],
        "linux",
      );

      assert.deepEqual(candidates, [
        path.join(
          "/cache",
          "chrome",
          "linux-141.0.2",
          "chrome-linux64",
          "chrome",
        ),
        path.join(
          "/cache",
          "chrome",
          "linux-140.0.1",
          "chrome-linux64",
          "chrome",
        ),
        path.join(
          "/cache",
          "chrome",
          "linux-139.0.0",
          "chrome-linux64",
          "chrome",
        ),
      ]);
    });

    test("is empty without any download", () => {
      assert.deepEqual(chromeCandidates("/cache", [], "linux"), []);
    });

    test("does not mutate the versions it was given", () => {
      const versions = ["linux-1", "linux-2"];
      chromeCandidates("/cache", versions, "linux");
      assert.deepEqual(versions, ["linux-1", "linux-2"]);
    });
  });

  describe("resolveChromeExecutable", () => {
    let cacheDir;

    beforeEach(async () => {
      cacheDir = await mkdtemp(path.join(tmpdir(), "whmcs-chrome-"));
    });

    afterEach(async () => {
      await rm(cacheDir, { recursive: true, force: true });
    });

    async function installFakeChrome(version) {
      const relativePath = browserRelativePaths()[0];
      const target = path.join(cacheDir, "chrome", version, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "#!/bin/sh\n");
      await chmod(target, 0o755);
      return target;
    }

    test("uses a configured executable path first", async () => {
      const configured = await installFakeChrome("linux-1.0.0");

      assert.equal(
        resolveChromeExecutable(
          {
            executablePath: configured,
            cacheDir: "/nowhere",
            homeCacheDir: false,
          },
          NO_PUPPETEER,
        ),
        configured,
      );
    });

    test("finds the browser a CI step installed into the project cache", async () => {
      await installFakeChrome("linux-140.0.0");
      const newest = await installFakeChrome("linux-141.0.0");

      assert.equal(
        resolveChromeExecutable(
          { executablePath: false, cacheDir, homeCacheDir: false },
          NO_PUPPETEER,
        ),
        newest,
      );
    });

    test("ignores a configured path that does not exist", async () => {
      const installed = await installFakeChrome("linux-1.0.0");

      assert.equal(
        resolveChromeExecutable(
          {
            executablePath: path.join(cacheDir, "missing", "chrome"),
            cacheDir,
            homeCacheDir: false,
          },
          NO_PUPPETEER,
        ),
        installed,
      );
    });

    test("falls back to what puppeteer resolves", async () => {
      const installed = await installFakeChrome("linux-1.0.0");

      assert.equal(
        resolveChromeExecutable(
          {
            executablePath: false,
            cacheDir: path.join(cacheDir, "empty"),
            homeCacheDir: false,
          },
          { executablePath: () => installed },
        ),
        installed,
      );
    });

    test("falls back to the browser in the user's own puppeteer cache", async () => {
      const installed = await installFakeChrome("linux-1.0.0");

      assert.equal(
        resolveChromeExecutable(
          {
            executablePath: false,
            cacheDir: path.join(cacheDir, "empty"),
            homeCacheDir: cacheDir,
          },
          NO_PUPPETEER,
        ),
        installed,
      );
    });

    test("ignores a puppeteer that answers with something other than a path", async () => {
      // puppeteer.executablePath() returns {} when it has no browser installed.
      const installed = await installFakeChrome("linux-1.0.0");

      assert.equal(
        resolveChromeExecutable(
          { executablePath: false, cacheDir, homeCacheDir: false },
          { executablePath: () => ({}) },
        ),
        installed,
      );
    });

    test("fails with a directed error when a non-path is all there is", () => {
      assert.throws(
        () =>
          resolveChromeExecutable(
            {
              executablePath: false,
              cacheDir: path.join(cacheDir, "empty"),
              homeCacheDir: false,
            },
            { executablePath: () => ({}) },
          ),
        (error) => {
          assert.equal(error.code, "ChromeNotFound");
          return true;
        },
      );
    });

    test("fails with a directed error when there is no browser at all", () => {
      assert.throws(
        () =>
          resolveChromeExecutable(
            {
              executablePath: false,
              cacheDir: path.join(cacheDir, "empty"),
              homeCacheDir: false,
            },
            NO_PUPPETEER,
          ),
        (error) => {
          assert.equal(error.code, "ChromeNotFound");
          assert.match(error.details, /puppeteer browsers install chrome/);
          return true;
        },
      );
    });
  });
});
