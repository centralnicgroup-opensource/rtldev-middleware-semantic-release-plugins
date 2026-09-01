const SUCCESS_SELECTOR = ".alert-success, .alert.alert-success";
const ERROR_SELECTOR = ".alert-danger, .alert.alert-danger";

/** Waits for a fixed number of milliseconds. */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Closes a page and its browser, ignoring teardown failures. */
export async function safeClose(page) {
  if (!page) {
    return;
  }

  try {
    if (typeof page.browser === "function") {
      const browser = page.browser();
      if (browser && typeof browser.close === "function") {
        await browser.close();
        return;
      }
    }

    if (typeof page.close === "function") {
      await page.close();
    }
  } catch {
    // Nothing useful to do if the browser is already gone.
  }
}

/**
 * The Marketplace's own message from an alert, or "" when there is none. This
 * is the only place the reason for a rejected form or login is stated, so it
 * is worth reading before reporting a failure.
 */
export async function readAlertText(page, selector = ERROR_SELECTOR) {
  try {
    const alert = await page.$(selector);
    if (!alert) {
      return "";
    }

    const text = await alert.evaluate((el) => el.textContent);
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

/**
 * Waits for either a URL change or a selector to appear, whichever happens
 * first. The Marketplace answers a login both ways depending on how far the
 * session got, so neither signal alone is reliable. `failSelector` is polled
 * alongside them so that a rejected login is reported in seconds instead of
 * burning the whole timeout.
 */
export async function waitForNavigationOrSelector(
  page,
  {
    urlPart = "",
    selector = "",
    failSelector = "",
    timeout = 15000,
    pollInterval = 300,
  } = {},
) {
  let url = page.url();
  const start = Date.now();
  const found = async (candidate) => {
    try {
      await page.waitForSelector(candidate, { timeout: pollInterval });
      return true;
    } catch {
      return false;
    }
  };

  while (Date.now() - start < timeout) {
    url = page.url();
    if (urlPart && url.includes(urlPart)) {
      return { redirected: true, selectorFound: false, failed: false, url };
    }

    if (selector && (await found(selector))) {
      return {
        redirected: false,
        selectorFound: true,
        failed: false,
        url: page.url(),
      };
    }

    if (failSelector && (await found(failSelector))) {
      return {
        redirected: false,
        selectorFound: false,
        failed: true,
        url: page.url(),
      };
    }

    await wait(pollInterval);
  }

  return { redirected: false, selectorFound: false, failed: false, url };
}

/**
 * Fills an input and verifies what landed in it, falling back to setting the
 * value directly when typing did not take.
 */
export async function robustType(page, selector, value, delay = 30) {
  await page.focus(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay });

  let actual = await page.$eval(selector, (el) => el.value);
  if (actual !== value) {
    await page.evaluate(
      (sel, val) => {
        document.querySelector(sel).value = val;
      },
      selector,
      value,
    );
    actual = await page.$eval(selector, (el) => el.value);
  }

  return actual;
}

/**
 * Sets the value of an `input[type=date]`, which cannot be typed into
 * reliably, and fires the events the form's own scripts listen for.
 */
export async function setDateValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    selector,
    value,
  );
}

/** Waits until a submit button is no longer disabled. */
export function waitForEnabled(page, selector, timeout) {
  return page.waitForFunction(
    (sel) => !document.querySelector(sel)?.disabled,
    { timeout },
    selector,
  );
}

/**
 * Clicks a button and gives the page a chance to navigate. Some Marketplace
 * forms answer in place instead, so a navigation timeout is not a failure.
 */
export async function clickAndWaitForResult(
  page,
  selector,
  { timeout = 10000, waitAfter = 200 } = {},
) {
  await page.waitForSelector(selector, { visible: true, timeout });
  const button = await page.$(selector);
  if (!button) {
    throw new Error(`Button not found: ${selector}`);
  }

  if (await button.evaluate((el) => el.disabled)) {
    throw new Error(`Button is disabled: ${selector}`);
  }

  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(waitAfter);

  let navigated = false;
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }),
      button.evaluate((el) => el.click()),
    ]);
    navigated = true;
  } catch {
    // The form answered without navigating; the alert check below decides.
  }

  await wait(waitAfter);
  return navigated;
}

/**
 * Reads the outcome of a submitted form: "success", "error", or "none" when
 * neither alert appeared before the timeout.
 */
export async function waitForSubmitResult(page, { timeout = 10000 } = {}) {
  try {
    await page.waitForSelector(`${SUCCESS_SELECTOR},${ERROR_SELECTOR}`, {
      timeout,
    });

    if (await page.$(SUCCESS_SELECTOR)) {
      return "success";
    }

    if (await page.$(ERROR_SELECTOR)) {
      return "error";
    }
  } catch {
    // No alert appeared at all.
  }

  return "none";
}

export { SUCCESS_SELECTOR, ERROR_SELECTOR };
