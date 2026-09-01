import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getContextEnv, isDebugEnabled } from "../../core/index.js";

const BUNDLED_COOKIE_EXTENSION = fileURLToPath(
  new URL("./extensions/I-Still-Dont-Care-About-Cookies", import.meta.url),
);

/**
 * Reads a boolean from the environment. Anything but the documented falsy
 * spellings counts as enabled, so a bare `VAR=1` behaves as expected.
 */
function envFlag(value) {
  if (value === undefined || value === "") {
    return undefined;
  }

  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

/**
 * Resolves the plugin configuration. Environment variables take precedence
 * over the plugin configuration, matching every other plugin in this package.
 */
export default (pluginConfig = {}, context) => {
  const env = getContextEnv(context);
  const cwd = context?.cwd || process.cwd();
  const workDir = env.PROJECT_WORKDIR || cwd;
  const timeouts = pluginConfig.timeouts || {};

  return {
    cwd,
    urlBase:
      env.WHMCSMP_URL ||
      pluginConfig.urlBase ||
      "https://marketplace.whmcs.com",
    login: env.WHMCSMP_LOGIN || pluginConfig.login || false,
    password: env.WHMCSMP_PASSWORD || pluginConfig.password || false,
    productId: env.WHMCSMP_PRODUCTID || pluginConfig.productId || false,
    minVersion: env.WHMCSMP_MINVERSION || pluginConfig.minVersion || "7.10",
    githubToken: env.GH_TOKEN || env.GITHUB_TOKEN || false,
    githubRepo:
      env.GH_REPO || env.GITHUB_REPO || pluginConfig.githubRepo || false,
    // Compatibility versions are ticked as part of a successful publish; a
    // failure there must not fail the release, it is corrected by re-running
    // the `updateCompatibility` operation.
    setCompatibleVersions: pluginConfig.setCompatibleVersions !== false,
    headless: firstDefined(
      envFlag(env.PUPPETEER_HEADLESS),
      pluginConfig.headless,
      true,
    ),
    executablePath:
      env.PUPPETEER_EXECUTABLE_PATH || pluginConfig.executablePath || false,
    // `prepare` installs the browser it will drive, rather than a release job
    // installing one ahead of time. semantic-release does not run prepare when
    // there is nothing to release, so a push that turns out to be a dependency
    // bump - or anything else that is not a fix or a feat - never pays for a
    // ~150MB download it was not going to use.
    installBrowser: firstDefined(
      envFlag(env.WHMCSMP_INSTALL_BROWSER),
      pluginConfig.installBrowser,
      true,
    ),
    // Chrome's OS libraries are installed with it, through apt, which needs
    // root. Set WHMCSMP_SKIP_OS_DEPS where the image already carries them.
    skipOsDeps: firstDefined(
      envFlag(env.WHMCSMP_SKIP_OS_DEPS),
      pluginConfig.skipOsDeps,
      false,
    ),
    // Replaces the whole install command, for a machine that provisions
    // browsers some other way.
    browserInstallCommand: pluginConfig.browserInstallCommand || [],
    cacheDir:
      env.PUPPETEER_CACHE_DIR || path.join(workDir, ".cache", "puppeteer"),
    // Last-resort browser location: puppeteer's own default cache, for a
    // machine where the browser was installed outside the project.
    homeCacheDir:
      pluginConfig.homeCacheDir ??
      path.join(os.homedir(), ".cache", "puppeteer"),
    keepBrowserOpenOnError: firstDefined(
      envFlag(env.PUPPETEER_KEEP_OPEN),
      pluginConfig.keepBrowserOpenOnError,
      false,
    ),
    useCookieExtension: firstDefined(
      envFlag(env.WHMCSMP_COOKIE_EXTENSION),
      pluginConfig.useCookieExtension,
      true,
    ),
    cookieExtensionPath: pluginConfig.cookieExtensionPath
      ? path.resolve(cwd, pluginConfig.cookieExtensionPath)
      : BUNDLED_COOKIE_EXTENSION,
    launchArgs: pluginConfig.launchArgs || [],
    timeouts: {
      goto: timeouts.goto || 30 * 1000,
      navigation: timeouts.navigation || 30 * 1000,
      selector: timeouts.selector || 15 * 1000,
      // How long to let a page settle around a click: the Marketplace forms
      // re-render before they answer, and clicking into that loses the click.
      settle: timeouts.settle ?? 200,
      // How long the cookie-banner extension gets to dismiss the consent
      // overlay before anything tries to click through it.
      cookieBanner: timeouts.cookieBanner ?? 2000,
    },
    debug: isDebugEnabled(env, "whmcs-marketplace"),
  };
};

export { BUNDLED_COOKIE_EXTENSION };
