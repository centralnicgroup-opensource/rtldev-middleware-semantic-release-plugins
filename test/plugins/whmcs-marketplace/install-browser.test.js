import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import installBrowser, {
  installCommand,
  isDebianLike,
  resolvePuppeteerCli,
} from "../../../src/plugins/whmcs-marketplace/install-browser.js";
import { browserRelativePaths } from "../../../src/plugins/whmcs-marketplace/resolve-chrome.js";
import { createConfig } from "./fake-page.js";

/** A puppeteer that has no browser of its own, so only the cache counts. */
const NO_PUPPETEER = { executablePath: () => ({}) };

function createRunner({ fails = false } = {}) {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (fails) {
      const error = new Error("Command failed with exit code 1");
      error.shortMessage = "apt-get: permission denied";
      throw error;
    }

    return { exitCode: 0 };
  };
  run.calls = calls;
  return run;
}

function createContext() {
  const logged = [];
  return {
    logged,
    env: {},
    logger: { log: (...args) => logged.push(args.join(" ")), error() {} },
  };
}

describe("whmcs-marketplace install-browser", () => {
  describe("resolvePuppeteerCli", () => {
    test("resolves the CLI of the installed puppeteer, not a downloaded one", () => {
      const cli = resolvePuppeteerCli();

      assert.ok(path.isAbsolute(cli));
      assert.match(cli, /node_modules.*puppeteer/);
    });
  });

  describe("isDebianLike", () => {
    test("is true when the marker is there", () => {
      assert.equal(isDebianLike("/etc/hosts"), true);
    });

    test("is false when it is not", () => {
      assert.equal(isDebianLike("/etc/no-such-marker"), false);
    });
  });

  describe("installCommand", () => {
    const base = { cli: "/cli.js", env: { PATH: "/usr/bin" } };

    test("runs puppeteer's CLI directly when no OS dependencies are needed", () => {
      const command = installCommand(createConfig({ cacheDir: "/cache" }), {
        ...base,
        isRoot: false,
        installOsDeps: false,
      });

      assert.equal(command.sudo, false);
      assert.equal(command.command, process.execPath);
      assert.deepEqual(command.args, [
        "/cli.js",
        "browsers",
        "install",
        "chrome",
      ]);
    });

    test("asks for OS dependencies through sudo, carrying the cache directory", () => {
      const command = installCommand(createConfig({ cacheDir: "/cache" }), {
        ...base,
        isRoot: false,
        installOsDeps: true,
      });

      assert.equal(command.sudo, true);
      assert.equal(command.command, "sudo");
      // sudo resolves the cache against root's home otherwise, and the release
      // then cannot find the browser it just installed.
      assert.ok(command.args.includes("PUPPETEER_CACHE_DIR=/cache"));
      assert.ok(command.args.includes("PATH=/usr/bin"));
      assert.ok(command.args.includes("--install-deps"));
    });

    test("needs no sudo when it is already root", () => {
      const command = installCommand(createConfig(), {
        ...base,
        isRoot: true,
        installOsDeps: true,
      });

      assert.equal(command.sudo, false);
      assert.equal(command.command, process.execPath);
      assert.ok(command.args.includes("--install-deps"));
    });

    test("a configured command replaces the whole thing", () => {
      const command = installCommand(
        createConfig({
          browserInstallCommand: ["apt-get", "install", "chrome"],
        }),
        { ...base, isRoot: false, installOsDeps: true },
      );

      assert.deepEqual(command, {
        command: "apt-get",
        args: ["install", "chrome"],
        sudo: false,
      });
    });
  });

  describe("installBrowser", () => {
    let cacheDir;

    beforeEach(async () => {
      cacheDir = await mkdtemp(path.join(tmpdir(), "whmcs-install-"));
    });

    afterEach(async () => {
      await rm(cacheDir, { recursive: true, force: true });
    });

    async function installFakeChrome() {
      const target = path.join(
        cacheDir,
        "chrome",
        "linux-1.0.0",
        browserRelativePaths()[0],
      );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "#!/bin/sh\n");
      await chmod(target, 0o755);
      return target;
    }

    function config(overrides = {}) {
      return createConfig({
        cacheDir,
        homeCacheDir: false,
        skipOsDeps: true,
        ...overrides,
      });
    }

    test("installs nothing when a browser is already there", async () => {
      const installed = await installFakeChrome();
      const run = createRunner();

      const result = await installBrowser(config(), createContext(), {
        run,
        puppeteer: NO_PUPPETEER,
      });

      assert.equal(result, installed);
      assert.deepEqual(run.calls, []);
    });

    test("installs a browser and returns where it landed", async () => {
      const run = createRunner();
      run.calls.install = true;
      const context = createContext();
      let installed;
      const runInstalling = async (...args) => {
        const result = await run(...args);
        installed = await installFakeChrome();
        return result;
      };

      const result = await installBrowser(config(), context, {
        run: runInstalling,
        puppeteer: NO_PUPPETEER,
      });

      assert.equal(result, installed);
      assert.equal(run.calls.length, 1);
      assert.match(context.logged.join("\n"), /installing Chrome into/);
      assert.match(context.logged.join("\n"), /using Chrome at/);
    });

    test("passes the cache directory to the installer", async () => {
      const run = createRunner();

      await installBrowser(config(), createContext(), {
        run,
        puppeteer: NO_PUPPETEER,
      });

      assert.equal(run.calls[0].options.env.PUPPETEER_CACHE_DIR, cacheDir);
    });

    test("does not install when installation is turned off", async () => {
      const run = createRunner();

      const result = await installBrowser(
        config({ installBrowser: false }),
        createContext(),
        { run, puppeteer: NO_PUPPETEER },
      );

      assert.equal(result, false);
      assert.deepEqual(run.calls, []);
    });

    test("reports a failed installation instead of throwing", async () => {
      const context = createContext();

      const result = await installBrowser(config(), context, {
        run: createRunner({ fails: true }),
        puppeteer: NO_PUPPETEER,
      });

      assert.equal(result, false);
      assert.match(context.logged.join("\n"), /installing Chrome failed/);
      assert.match(context.logged.join("\n"), /permission denied/);
    });

    test("reports an installation that left no browser behind", async () => {
      const context = createContext();

      const result = await installBrowser(config(), context, {
        run: createRunner(),
        puppeteer: NO_PUPPETEER,
      });

      assert.equal(result, false);
      assert.match(context.logged.join("\n"), /could not be found in/);
    });
  });
});
