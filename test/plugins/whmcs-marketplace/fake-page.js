import {
  ERROR_SELECTOR,
  SUCCESS_SELECTOR,
} from "../../../src/plugins/whmcs-marketplace/page-utils.js";
import resolveConfig from "../../../src/plugins/whmcs-marketplace/resolve-config.js";

/**
 * A stand-in for a Puppeteer ElementHandle. `node` is what the page-side
 * callbacks passed to `evaluate` receive.
 */
export function createFakeElement(node = {}) {
  const element = {
    node: {
      disabled: false,
      textContent: "",
      scrollIntoView() {},
      click() {},
      ...node,
    },
    clicks: 0,
    async evaluate(fn, ...args) {
      return fn(element.node, ...args);
    },
    async boundingBox() {
      return node.boundingBox === null
        ? null
        : { x: 0, y: 0, width: 10, height: 10 };
    },
    async click() {
      element.clicks += 1;
    },
    async $(selector) {
      return (node.children || {})[selector] || null;
    },
    async $$(selector) {
      const child = (node.children || {})[selector];
      return Array.isArray(child) ? child : child ? [child] : [];
    },
  };

  return element;
}

/**
 * A stand-in for a Puppeteer Page, driven by plain options instead of a DOM.
 * Only the surface the marketplace operations actually use is implemented.
 *
 * - `alertResult`: which alert the next submitted form answers with
 * - `elements` / `nodes`: what `$`, `$$` and `$$eval` see per selector
 * - `values`: current input values, updated by typing
 * - `missingSelectors`: selectors whose `waitForSelector` times out
 */
export function createFakePage({
  alertResult = "success",
  alertText = "",
  elements = {},
  nodes = {},
  values = {},
  missingSelectors = [],
  navigates = true,
  url = "https://marketplace.whmcs.test/user/login",
  urlAfterClick = "",
  title = "Log in - WHMCS Marketplace",
} = {}) {
  const state = { url, values: new Map(Object.entries(values)) };
  const calls = [];
  const record = (method, ...args) => calls.push({ method, args });

  const page = {
    calls,
    state,
    closed: false,
    browserClosed: false,
    keyboard: {
      async press(key) {
        record("keyboard.press", key);
      },
    },
    url: () => state.url,
    async title() {
      return title;
    },
    on() {},
    async setExtraHTTPHeaders() {},
    async setUserAgent() {},
    async setJavaScriptEnabled() {},
    async goto(target) {
      record("goto", target);
      state.url = target;
    },
    async waitForSelector(selector) {
      record("waitForSelector", selector);
      if (missingSelectors.includes(selector)) {
        throw new Error(`selector not found: ${selector}`);
      }

      if (
        selector === `${SUCCESS_SELECTOR},${ERROR_SELECTOR}` &&
        alertResult === "none"
      ) {
        throw new Error("no alert appeared");
      }

      return createFakeElement();
    },
    async waitForFunction() {
      record("waitForFunction");
      if (missingSelectors.includes("waitForFunction")) {
        throw new Error("condition never became true");
      }
    },
    async waitForNavigation() {
      record("waitForNavigation");
      if (!navigates) {
        throw new Error("navigation timeout");
      }
    },
    async $(selector) {
      record("$", selector);
      if (selector === SUCCESS_SELECTOR) {
        return alertResult === "success"
          ? createFakeElement({ textContent: alertText })
          : null;
      }

      if (selector === ERROR_SELECTOR) {
        return alertResult === "error"
          ? createFakeElement({ textContent: alertText })
          : null;
      }

      const element = elements[selector];
      return Array.isArray(element) ? element[0] || null : element || null;
    },
    async $$(selector) {
      record("$$", selector);
      const element = elements[selector];
      if (Array.isArray(element)) {
        return element;
      }

      return element ? [element] : [];
    },
    async $eval(selector, fn) {
      return fn({ value: state.values.get(selector) });
    },
    async $$eval(selector, fn, ...args) {
      record("$$eval", selector);
      return fn(nodes[selector] || [], ...args);
    },
    async evaluate(fn, ...args) {
      record("evaluate", ...args);
      // Page-side callbacks cannot run here. The two that matter both set a
      // value by selector, so record that instead of executing them.
      if (args.length === 2 && typeof args[0] === "string") {
        state.values.set(args[0], args[1]);
      }
    },
    async focus(selector) {
      record("focus", selector);
    },
    async click(selector) {
      record("click", selector);
      if (urlAfterClick) {
        state.url = urlAfterClick;
      }
    },
    async type(selector, value) {
      record("type", selector, value);
      state.values.set(selector, value);
    },
    browser: () => ({
      async close() {
        page.browserClosed = true;
      },
    }),
    async close() {
      page.closed = true;
    },
  };

  return page;
}

const CONTEXT = {
  env: {
    WHMCSMP_LOGIN: "release@example.test",
    WHMCSMP_PASSWORD: "secret",
    WHMCSMP_PRODUCTID: "4887",
  },
  logger: { log() {}, error() {} },
};

/** A resolved configuration with test credentials filled in. */
export function createConfig(overrides = {}) {
  return {
    ...resolveConfig({}, CONTEXT),
    urlBase: "https://marketplace.whmcs.test",
    ...overrides,
    timeouts: {
      goto: 1000,
      navigation: 1000,
      selector: 1000,
      // No settling or banner to wait for: the fake page answers immediately.
      settle: 0,
      cookieBanner: 0,
      ...(overrides.timeouts || {}),
    },
  };
}

/** A stand-in for an authenticated MarketplaceSession. */
export function createFakeSession({ page, config = {}, debug } = {}) {
  const resolved = createConfig(config);
  const fakePage = page || createFakePage();
  const debugCalls = [];

  const session = {
    page: fakePage,
    config: resolved,
    debugCalls,
    debug: debug || ((...args) => debugCalls.push(args)),
    // Every reported failure, so a test can assert the reason a caller would
    // actually be told rather than just that something returned false.
    reports: [],
    failureReason: "",
    report(message) {
      session.failureReason = message;
      session.reports.push(message);
    },
    heldOpen: 0,
    selectorOptions: { timeout: resolved.timeouts.selector },
    navigationOptions: {
      waitUntil: ["networkidle0"],
      timeout: resolved.timeouts.navigation,
    },
    gotoOptions: {
      waitUntil: ["load", "domcontentloaded"],
      timeout: resolved.timeouts.goto,
    },
    productUrl: (suffix = "") =>
      `${resolved.urlBase}/product/${resolved.productId}${suffix}`,
    async goto(url) {
      await fakePage.goto(url);
    },
    async holdOpenForDebugging() {
      session.heldOpen += 1;
    },
  };

  return session;
}
