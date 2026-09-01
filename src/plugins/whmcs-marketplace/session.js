import fs from "node:fs";
import createDebug from "./debug.js";
import getError from "./get-error.js";
import resolveChromeExecutable from "./resolve-chrome.js";
import {
  ERROR_SELECTOR,
  readAlertText,
  robustType,
  safeClose,
  wait,
  waitForNavigationOrSelector,
} from "./page-utils.js";

const DEBUG_WINDOW = 60 * 1000;

const BASE_LAUNCH_ARGS = [
  "--disable-gpu",
  "--start-maximized",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--ignore-certificate-errors",
  "--ignore-certificate-errors-spki-list",
];

// Last-resort user agent, only used if the browser will not say what it is.
const FALLBACK_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * The browser's own user agent with the headless marker removed. Announcing a
 * pinned old Chrome makes the Marketplace's consent manager refuse to run
 * ("your browser is not supported"), and announcing HeadlessChrome invites
 * being blocked outright - so report what this really is, minus the giveaway.
 */
export async function resolveUserAgent(browser) {
  try {
    const userAgent = await browser.userAgent();
    return userAgent ? userAgent.replace(/Headless/g, "") : FALLBACK_USER_AGENT;
  } catch {
    return FALLBACK_USER_AGENT;
  }
}

/** Imports the optional peer dependency, or fails with a directed error. */
export async function loadPuppeteer() {
  try {
    return (await import("puppeteer")).default;
  } catch {
    throw getError("PuppeteerMissing");
  }
}

/**
 * Browser launch arguments, including the cookie-banner extension.
 *
 * The extension is load-bearing: without it the Marketplace's consent overlay
 * covers the login form. It only loads in Chrome's "new" headless mode - the
 * old one accepted `--load-extension` and silently ignored it, which is why
 * this used to need a full browser and a `PUPPETEER_EXECUTABLE_PATH`.
 * `headless: true` has meant new headless since puppeteer 22, so the bundled
 * Chrome for Testing is fine, but nothing about that is visible at runtime:
 * Chrome starts perfectly happily with no extension loaded and the login then
 * fails for what looks like a credentials problem. `browser.integration.js`
 * asserts the extension really is there, and is the test to run when a
 * marketplace login starts failing after a browser or puppeteer bump.
 */
export function launchArgs(config) {
  const args = [...BASE_LAUNCH_ARGS, ...config.launchArgs];

  if (config.useCookieExtension) {
    args.push(
      `--disable-extensions-except=${config.cookieExtensionPath}`,
      `--load-extension=${config.cookieExtensionPath}`,
    );
  }

  return args;
}

/**
 * One authenticated WHMCS Marketplace browser session. Every marketplace
 * operation runs inside one of these, so login, timeouts and teardown live
 * here rather than in each operation.
 */
export default class MarketplaceSession {
  constructor(config, context, { browser, page }) {
    this.config = config;
    this.context = context;
    this.browser = browser;
    this.page = page;
    this.logger = context?.logger || console;
    this.debug = createDebug(config, context);
    // Why the last operation gave up, for the caller to report. Marketplace
    // operations return false rather than throwing, so without this the reason
    // would only ever exist in the debug log.
    this.failureReason = "";
  }

  /**
   * Reports something that went wrong. Unlike `debug` this is unconditional:
   * a marketplace failure is rare and always worth a line in the release log,
   * which is the only place anyone will look for it.
   */
  report(message) {
    this.failureReason = message;
    this.logger.log?.(`WHMCS Marketplace: ${message}`);
  }

  static async open(config, context) {
    const debug = createDebug(config, context);
    const puppeteer = await loadPuppeteer();
    const executablePath = resolveChromeExecutable(config, puppeteer, debug);

    if (config.useCookieExtension) {
      debug(
        "loading cookie-banner extension from %s",
        config.cookieExtensionPath,
      );
    }

    const browser = await puppeteer.launch({
      headless: config.headless,
      defaultViewport: null,
      args: launchArgs(config),
      executablePath,
    });

    const [page] = await browser.pages();
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    });
    const userAgent = await resolveUserAgent(browser);
    debug("user agent: %s", userAgent);
    await page.setUserAgent(userAgent);
    await page.setJavaScriptEnabled(true);

    if (config.debug) {
      page.on("console", (message) =>
        debug("page console: %s", message.text()),
      );
    }

    return new MarketplaceSession(config, context, { browser, page });
  }

  get gotoOptions() {
    return {
      waitUntil: ["load", "domcontentloaded"],
      timeout: this.config.timeouts.goto,
    };
  }

  get navigationOptions() {
    return {
      waitUntil: ["networkidle0"],
      timeout: this.config.timeouts.navigation,
    };
  }

  get selectorOptions() {
    return { timeout: this.config.timeouts.selector };
  }

  /** Absolute URL for a path below the marketplace product being released. */
  productUrl(suffix = "") {
    return `${this.config.urlBase}/product/${this.config.productId}${suffix}`;
  }

  async goto(url, options) {
    this.debug("navigating to %s", url);
    await this.page.goto(url, options || this.gotoOptions);
    this.debug("navigation to %s complete", url);
  }

  /**
   * Authenticates against the Marketplace. Returns false rather than throwing
   * so callers can degrade to "not published" instead of failing the release,
   * and reports why through `report` so the reason survives.
   */
  async login() {
    const { page, config } = this;
    const submitSelector = 'div.login-leftcol form button[type="submit"]';

    if (!config.login || !config.password) {
      this.report("no credentials configured");
      return false;
    }

    try {
      await this.goto(`${config.urlBase}/user/login`);
      // Give the cookie-banner extension a window to dismiss the overlay
      // before anything tries to click through it.
      await wait(config.timeouts.cookieBanner);

      try {
        await page.waitForSelector("#email", this.selectorOptions);
        await page.waitForSelector("#password", this.selectorOptions);
        await page.waitForSelector(submitSelector, this.selectorOptions);
      } catch {
        // The login form is not there at all, which is what an interstitial
        // (a bot check, an outage page) looks like from here.
        this.report(
          `the login form never appeared (${await this.describePage()})`,
        );
        await this.holdOpenForDebugging();
        return false;
      }

      const email = await robustType(page, "#email", config.login);
      if (email !== config.login) {
        this.report("the login form did not accept the account name");
        await this.holdOpenForDebugging();
        return false;
      }

      await robustType(page, "#password", config.password);
      this.debug("credentials entered for %s", config.login);
      await page.click(submitSelector);

      const { redirected, selectorFound, failed } =
        await waitForNavigationOrSelector(page, {
          urlPart: "/account",
          selector: ".account-navbar",
          failSelector: ERROR_SELECTOR,
          timeout: config.timeouts.selector,
        });

      if (!redirected && !selectorFound) {
        const alert = await readAlertText(page);
        this.report(
          alert
            ? `the Marketplace rejected the login for ${config.login}: "${alert}"`
            : `the login for ${config.login} neither succeeded nor reported an error within ${config.timeouts.selector}ms (${await this.describePage()})`,
        );
        this.debug("login failed (error alert shown: %s)", failed);
        await this.holdOpenForDebugging();
        return false;
      }

      this.debug(
        "login succeeded (redirected: %s, selectorFound: %s)",
        redirected,
        selectorFound,
      );
      this.failureReason = "";
      return true;
    } catch (error) {
      this.report(`the login for ${config.login} failed: ${error.message}`);
      await this.holdOpenForDebugging();
      return false;
    }
  }

  /** The page's URL and title, for saying what was served instead. */
  async describePage() {
    try {
      return `URL: ${this.page.url()}, title: "${await this.page.title()}"`;
    } catch {
      return `URL: ${this.page.url()}`;
    }
  }

  /** Keeps the browser alive briefly when asked to, for interactive debugging. */
  async holdOpenForDebugging() {
    if (this.config.keepBrowserOpenOnError) {
      this.debug(
        "keeping the browser open for %dms for debugging",
        DEBUG_WINDOW,
      );
      await wait(DEBUG_WINDOW);
    }
  }

  close() {
    return safeClose(this.page);
  }
}

/**
 * Opens a session, logs in, hands it to the callback, and always closes it.
 * Returns false when the login failed, so operations share one shape.
 */
export async function withSession(config, context, callback) {
  const session = await MarketplaceSession.open(config, context);

  try {
    if (!(await session.login())) {
      return false;
    }

    return await callback(session);
  } finally {
    await session.close();
  }
}

/** Verifies the cookie-banner extension is where the configuration says. */
export function assertCookieExtension(config) {
  if (config.useCookieExtension && !fs.existsSync(config.cookieExtensionPath)) {
    throw getError("CookieExtensionNotFound");
  }
}
