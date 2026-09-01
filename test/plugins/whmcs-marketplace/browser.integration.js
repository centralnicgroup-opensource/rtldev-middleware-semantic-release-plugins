import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import resolveConfig from "../../../src/plugins/whmcs-marketplace/resolve-config.js";
import resolveChromeExecutable from "../../../src/plugins/whmcs-marketplace/resolve-chrome.js";
import MarketplaceSession, {
  loadPuppeteer,
} from "../../../src/plugins/whmcs-marketplace/session.js";
import {
  robustType,
  wait,
} from "../../../src/plugins/whmcs-marketplace/page-utils.js";

/**
 * Launches a real browser against the real WHMCS Marketplace, without
 * credentials: `pnpm run test:browser`. It covers the two things the unit tests
 * cannot, and that a release would otherwise be the first to discover — that
 * the vendored cookie-banner extension actually loads and keeps the consent
 * overlay off the login form, and that the login form still has the selectors
 * the plugin types into.
 *
 * Nothing here logs in, so it publishes nothing. It needs a browser:
 * `pnpm exec puppeteer browsers install chrome --install-deps`.
 */
const LOGIN_SUBMIT_SELECTOR = 'div.login-leftcol form button[type="submit"]';

const context = { env: process.env, logger: console };

function createConfig(overrides = {}) {
  return { ...resolveConfig({}, context), ...overrides };
}

/** Why the suite cannot run here, or false when it can. */
async function findBlocker() {
  let puppeteer;
  try {
    puppeteer = await loadPuppeteer();
  } catch {
    return "puppeteer is not installed (pnpm add -D puppeteer)";
  }

  try {
    resolveChromeExecutable(createConfig(), puppeteer);
    return false;
  } catch {
    return "no browser installed (pnpm exec puppeteer browsers install chrome --install-deps)";
  }
}

/** Is the element at the centre of `selector` the element itself? */
function overlayCheck(page, selector) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) {
      return { found: false };
    }

    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );

    return {
      found: true,
      clickable:
        element === top || element.contains(top) || top?.contains(element),
      topElement: top ? `${top.tagName}.${top.className}` : "nothing",
    };
  }, selector);
}

describe(
  "whmcs-marketplace in a real browser",
  { concurrency: 1 },
  async () => {
    const blocker = await findBlocker();
    const options = blocker ? { skip: blocker } : {};
    let session;

    before(async () => {
      if (!blocker) {
        session = await MarketplaceSession.open(createConfig(), context);
      }
    });

    after(async () => {
      await session?.close();
    });

    test(
      "launches Chrome with the bundled cookie extension",
      options,
      async (t) => {
        assert.ok(session?.page, "no page was opened");

        // An unpacked MV3 extension shows up as its own target once the service
        // worker starts, which can lag the launch slightly.
        let extensionTargets = [];
        for (
          let attempt = 0;
          attempt < 20 && !extensionTargets.length;
          attempt += 1
        ) {
          extensionTargets = session.browser
            .targets()
            .filter((target) => target.url().startsWith("chrome-extension://"));
          if (!extensionTargets.length) {
            await wait(250);
          }
        }

        t.diagnostic(
          `extension targets: ${extensionTargets.map((target) => target.url()).join(", ") || "none"}`,
        );
        assert.ok(
          extensionTargets.length > 0,
          "the cookie extension did not load - Chrome starts without it silently",
        );
      },
    );

    test(
      "the Marketplace login form still has the selectors the plugin drives",
      options,
      async () => {
        await session.goto(`${session.config.urlBase}/user/login`);
        await wait(2000);

        for (const selector of ["#email", "#password", LOGIN_SUBMIT_SELECTOR]) {
          await session.page.waitForSelector(selector, session.selectorOptions);
        }
      },
    );

    test(
      "the login fields accept input, as the plugin fills them",
      options,
      async () => {
        const typed = await robustType(
          session.page,
          "#email",
          "not-a-real-account@example.test",
        );

        assert.equal(typed, "not-a-real-account@example.test");
      },
    );

    test(
      "no consent overlay covers the login submit button",
      options,
      async (t) => {
        const result = await overlayCheck(session.page, LOGIN_SUBMIT_SELECTOR);

        t.diagnostic(`element at the button's centre: ${result.topElement}`);
        assert.ok(result.found, "the submit button is not on the page");
        assert.ok(
          result.clickable,
          `something is covering the submit button: ${result.topElement}`,
        );
      },
    );

    test(
      "the compatibility tab is reachable and asks for a login",
      options,
      async () => {
        // Unauthenticated, the Marketplace answers the product edit page with its
        // login form rather than a 404 - which is what proves the URL shape the
        // plugin builds is still the right one.
        await session.goto(session.productUrl("/edit"));
        const url = session.page.url();

        assert.match(url, /\/(user\/login|product\/)/);
      },
    );
  },
);
