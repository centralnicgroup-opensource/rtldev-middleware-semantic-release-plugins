import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clickAndWaitForResult,
  robustType,
  safeClose,
  setDateValue,
  waitForNavigationOrSelector,
  waitForSubmitResult,
} from "../../../src/plugins/whmcs-marketplace/page-utils.js";
import { createFakeElement, createFakePage } from "./fake-page.js";

describe("whmcs-marketplace page-utils", () => {
  describe("robustType", () => {
    test("clears the field before typing and returns what landed in it", async () => {
      const page = createFakePage({ values: { "#version": "old" } });

      const actual = await robustType(page, "#version", "1.2.3", 0);

      assert.equal(actual, "1.2.3");
      const methods = page.calls.map((call) => call.method);
      assert.deepEqual(methods.slice(0, 4), [
        "focus",
        "click",
        "keyboard.press",
        "type",
      ]);
    });

    test("falls back to setting the value when typing did not take", async () => {
      const page = createFakePage();
      // Typing lands somewhere else, as an unfocused or masked field does.
      page.type = async () => {};

      const actual = await robustType(page, "#password", "secret", 0);

      assert.equal(actual, "secret");
      assert.ok(page.calls.some((call) => call.method === "evaluate"));
    });
  });

  test("setDateValue sets the value of a date input", async () => {
    const page = createFakePage();

    await setDateValue(page, "#released_at", "2026-09-01");

    assert.equal(page.state.values.get("#released_at"), "2026-09-01");
  });

  describe("waitForSubmitResult", () => {
    for (const alertResult of ["success", "error", "none"]) {
      test(`reports "${alertResult}"`, async () => {
        const page = createFakePage({ alertResult });

        assert.equal(
          await waitForSubmitResult(page, { timeout: 10 }),
          alertResult,
        );
      });
    }
  });

  describe("waitForNavigationOrSelector", () => {
    test("detects a redirect by URL", async () => {
      const page = createFakePage({ url: "https://marketplace.test/account" });

      const result = await waitForNavigationOrSelector(page, {
        urlPart: "/account",
        selector: ".account-navbar",
        timeout: 100,
      });

      assert.deepEqual(
        { redirected: result.redirected, selectorFound: result.selectorFound },
        { redirected: true, selectorFound: false },
      );
    });

    test("detects a post-login selector when the URL did not change", async () => {
      const page = createFakePage({
        url: "https://marketplace.test/user/login",
      });

      const result = await waitForNavigationOrSelector(page, {
        urlPart: "/account",
        selector: ".account-navbar",
        timeout: 100,
      });

      assert.deepEqual(
        { redirected: result.redirected, selectorFound: result.selectorFound },
        { redirected: false, selectorFound: true },
      );
    });

    test("gives up on neither signal within the timeout", async () => {
      const page = createFakePage({
        url: "https://marketplace.test/user/login",
        missingSelectors: [".account-navbar"],
      });

      const result = await waitForNavigationOrSelector(page, {
        urlPart: "/account",
        selector: ".account-navbar",
        timeout: 60,
        pollInterval: 10,
      });

      assert.deepEqual(
        { redirected: result.redirected, selectorFound: result.selectorFound },
        { redirected: false, selectorFound: false },
      );
    });
  });

  describe("clickAndWaitForResult", () => {
    test("clicks and reports the navigation", async () => {
      const button = createFakeElement();
      const page = createFakePage({ elements: { "button.submit": button } });

      assert.equal(
        await clickAndWaitForResult(page, "button.submit", {
          timeout: 10,
          waitAfter: 0,
        }),
        true,
      );
    });

    test("a form answering without navigating is not a failure", async () => {
      const button = createFakeElement();
      const page = createFakePage({
        elements: { "button.submit": button },
        navigates: false,
      });

      assert.equal(
        await clickAndWaitForResult(page, "button.submit", {
          timeout: 10,
          waitAfter: 0,
        }),
        false,
      );
    });

    test("refuses to click a disabled button", async () => {
      const button = createFakeElement({ disabled: true });
      const page = createFakePage({ elements: { "button.submit": button } });

      await assert.rejects(
        clickAndWaitForResult(page, "button.submit", {
          timeout: 10,
          waitAfter: 0,
        }),
        /Button is disabled/,
      );
    });

    test("reports a button that is not there", async () => {
      const page = createFakePage();

      await assert.rejects(
        clickAndWaitForResult(page, "button.missing", {
          timeout: 10,
          waitAfter: 0,
        }),
        /Button not found/,
      );
    });
  });

  describe("safeClose", () => {
    test("closes the browser behind the page", async () => {
      const page = createFakePage();

      await safeClose(page);

      assert.equal(page.browserClosed, true);
    });

    test("closes the page when there is no browser handle", async () => {
      const page = createFakePage();
      delete page.browser;

      await safeClose(page);

      assert.equal(page.closed, true);
    });

    test("ignores a page that is already gone", async () => {
      const page = createFakePage();
      page.browser = () => {
        throw new Error("browser has disconnected");
      };

      await safeClose(page);
    });

    test("does nothing without a page", async () => {
      await safeClose(undefined);
    });
  });
});
