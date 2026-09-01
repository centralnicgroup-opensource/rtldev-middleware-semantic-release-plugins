import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execa } from "execa";
import createDebug from "./debug.js";
import resolveChromeExecutable from "./resolve-chrome.js";
import resolveConfig from "./resolve-config.js";
import { loadPuppeteer } from "./session.js";

const DEBIAN_MARKER = "/etc/debian_version";

/** True on Debian and its derivatives, where `--install-deps` uses apt. */
export function isDebianLike(marker = DEBIAN_MARKER) {
  return existsSync(marker);
}

/**
 * The path to puppeteer's own CLI, which is what `puppeteer browsers install`
 * runs. Resolved through the installed package rather than through a package
 * manager: `pnpm dlx puppeteer` (what the predecessor plugin shelled out to)
 * downloads a second copy of puppeteer at release time and can pick a different
 * version than the one this release will actually drive.
 */
export function resolvePuppeteerCli(from = import.meta.url) {
  const require = createRequire(from);
  const manifestPath = require.resolve("puppeteer/package.json");
  const manifest = require("puppeteer/package.json");
  const relative =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.puppeteer;

  if (!relative) {
    throw new Error("the installed puppeteer declares no CLI");
  }

  return path.join(path.dirname(manifestPath), relative);
}

/**
 * The command that installs the browser. `--install-deps` installs Chrome's OS
 * libraries through apt, so it needs root; the cache directory is passed
 * explicitly because sudo would otherwise resolve it against root's home and
 * put the browser somewhere the release cannot find it again.
 */
export function installCommand(config, { cli, isRoot, env, installOsDeps }) {
  if (config.browserInstallCommand?.length) {
    const [command, ...rest] = config.browserInstallCommand;
    return { command, args: rest, sudo: false };
  }

  const args = ["browsers", "install", "chrome"];
  if (installOsDeps) {
    args.push("--install-deps");
  }

  if (installOsDeps && !isRoot) {
    return {
      command: "sudo",
      args: [
        "env",
        `PATH=${env.PATH || ""}`,
        `PUPPETEER_CACHE_DIR=${config.cacheDir}`,
        process.execPath,
        cli,
        ...args,
      ],
      sudo: true,
    };
  }

  return { command: process.execPath, args: [cli, ...args], sudo: false };
}

/**
 * Makes sure a browser is available, installing one if it is not. Never throws:
 * a marketplace listing that could not be updated must not fail a release, and
 * `publish` reports the missing browser on its own.
 *
 * @returns the executable path, or false when there is still no browser.
 */
export default async function installBrowser(
  config,
  context,
  { run = execa, puppeteer: injected } = {},
) {
  const debug = createDebug(config, context);
  const logger = context?.logger || console;
  const puppeteer = injected || (await loadPuppeteer());

  const existing = resolve(config, puppeteer, debug);
  if (existing) {
    debug("a browser is already installed at %s", existing);
    return existing;
  }

  if (!config.installBrowser) {
    debug("browser installation is disabled (installBrowser: false)");
    return false;
  }

  // Chrome's OS libraries only need installing where apt can do it, and only
  // when this has not been turned off (SKIP_OS_DEPS, for an image that already
  // carries them).
  const installOsDeps = !config.skipOsDeps && isDebianLike();

  let command;
  try {
    command = installCommand(config, {
      cli: resolvePuppeteerCli(),
      isRoot: process.getuid?.() === 0,
      env: getEnv(context),
      installOsDeps,
    });
  } catch (error) {
    logger.log(`WHMCS Marketplace: cannot install a browser: ${error.message}`);
    return false;
  }

  logger.log(
    `WHMCS Marketplace: installing Chrome into ${config.cacheDir}${installOsDeps ? ", with its OS dependencies" : ""}.`,
  );
  debug("running %s %s", command.command, command.args.join(" "));

  try {
    await run(command.command, command.args, {
      stdio: config.debug ? "inherit" : "ignore",
      env: { PUPPETEER_CACHE_DIR: config.cacheDir },
      extendEnv: true,
    });
  } catch (error) {
    logger.log(
      `WHMCS Marketplace: installing Chrome failed: ${error.shortMessage || error.message}`,
    );
    return false;
  }

  // Installed under sudo, the files belong to root; the release itself does not
  // run as root and only needs to read them, but a later install as this user
  // would fail on them.
  if (command.sudo) {
    await chownCache(config, run, debug);
  }

  const installed = resolve(config, puppeteer, debug);
  if (!installed) {
    logger.log(
      `WHMCS Marketplace: Chrome was installed but could not be found in ${config.cacheDir}.`,
    );
    return false;
  }

  logger.log(`WHMCS Marketplace: using Chrome at ${installed}.`);
  return installed;
}

function resolve(config, puppeteer, debug) {
  try {
    return resolveChromeExecutable(config, puppeteer, debug);
  } catch {
    return false;
  }
}

function getEnv(context) {
  return context?.env || process.env;
}

async function chownCache(config, run, debug) {
  try {
    await run("sudo", [
      "chown",
      "-R",
      `${process.getuid?.()}:${process.getgid?.()}`,
      config.cacheDir,
    ]);
  } catch (error) {
    debug("could not take ownership of %s: %s", config.cacheDir, error.message);
  }
}

/**
 * Runnable directly (`node src/plugins/whmcs-marketplace/install-browser.js`,
 * or `pnpm run browser:install`), so that the release hook, CI and the
 * devcontainer all provision the browser through this one implementation
 * instead of each carrying its own copy of the command.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const context = { env: process.env, logger: console };
  const installed = await installBrowser(
    resolveConfig({}, { env: process.env, cwd: process.cwd() }),
    context,
  );
  process.exitCode = installed ? 0 : 1;
}
