import assert from "node:assert/strict";
import { describe, test } from "node:test";
import publishVersion, {
  submitVersion,
} from "../../../src/plugins/whmcs-marketplace/publish-version.js";
import {
  createFakeElement,
  createFakePage,
  createFakeSession,
} from "./fake-page.js";

const SUBMIT_SELECTOR = 'div.listing-edit-container form button[type="submit"]';
const CHECKBOX_SELECTOR = 'input[name="versionIds[]"]';
const COMPATIBILITY_SUBMIT = 'div#compatibility button[type="submit"]';

function createPage({ alertResult = "success", classNames = ["7_10-a"] } = {}) {
  return createFakePage({
    alertResult,
    nodes: {
      [CHECKBOX_SELECTOR]: classNames.map((className) => ({ className })),
    },
    elements: {
      [SUBMIT_SELECTOR]: createFakeElement(),
      [COMPATIBILITY_SUBMIT]: createFakeElement(),
    },
  });
}

const RELEASE = { version: "1.2.3", notes: "# changed\n\ntwice." };

describe("whmcs-marketplace publish-version", () => {
  describe("submitVersion", () => {
    test("fills the form and returns the release", async () => {
      const page = createPage();
      const session = createFakeSession({ page });

      const result = await submitVersion(session, RELEASE);

      assert.deepEqual(result, {
        name: "WHMCS Marketplace Product Version",
        url: "https://marketplace.whmcs.test/product/4887",
      });
      assert.equal(page.state.values.get("#version"), "1.2.3");
      assert.equal(page.state.values.get("#description"), RELEASE.notes);
    });

    test("opens the product's new-version form", async () => {
      const page = createPage();
      const session = createFakeSession({ page });

      await submitVersion(session, RELEASE);

      assert.equal(
        page.calls.find((call) => call.method === "goto").args[0],
        "https://marketplace.whmcs.test/product/4887/versions/new",
      );
    });

    test("records today as the release date", async () => {
      const page = createPage();
      const session = createFakeSession({ page });

      await submitVersion(session, RELEASE);

      assert.equal(
        page.state.values.get("#released_at"),
        new Date().toISOString().slice(0, 10),
      );
    });

    test("ticks the compatible versions after a successful publish", async () => {
      const page = createPage();
      const session = createFakeSession({ page });

      await submitVersion(session, RELEASE);

      assert.ok(
        page.calls.some(
          (call) =>
            call.method === "goto" && call.args[0].endsWith("#compatibility"),
        ),
        "expected the compatibility tab to be visited on the same session",
      );
    });

    test("skips the compatibility update when it is turned off", async () => {
      const page = createPage();
      const session = createFakeSession({
        page,
        config: { setCompatibleVersions: false },
      });

      await submitVersion(session, RELEASE);

      assert.ok(
        !page.calls.some(
          (call) =>
            call.method === "goto" && call.args[0].endsWith("#compatibility"),
        ),
      );
    });

    test("a failed compatibility update does not undo the publish", async () => {
      const page = createPage();
      const session = createFakeSession({ page });
      const realWaitForSelector = page.waitForSelector;
      page.waitForSelector = async (selector) => {
        if (selector === CHECKBOX_SELECTOR) {
          throw new Error("compatibility table never appeared");
        }

        return realWaitForSelector.call(page, selector);
      };

      const result = await submitVersion(session, RELEASE);

      assert.equal(result.name, "WHMCS Marketplace Product Version");
    });

    test("returns false when the listing answers with an error", async () => {
      const session = createFakeSession({
        page: createPage({ alertResult: "error" }),
      });

      assert.equal(await submitVersion(session, RELEASE), false);
    });

    test("returns false when no alert appears at all", async () => {
      const session = createFakeSession({
        page: createPage({ alertResult: "none" }),
      });

      assert.equal(await submitVersion(session, RELEASE), false);
    });

    test("keeps the browser open on failure when asked to", async () => {
      const session = createFakeSession({
        page: createPage({ alertResult: "error" }),
        config: { keepBrowserOpenOnError: true },
      });

      await submitVersion(session, RELEASE);

      assert.equal(session.heldOpen, 1);
    });
  });

  describe("publish operation", () => {
    const config = createFakeSession().config;

    test("does nothing without a version", async () => {
      assert.equal(
        await publishVersion(config, { nextRelease: { notes: "notes" } }),
        false,
      );
    });

    test("does nothing without release notes", async () => {
      assert.equal(
        await publishVersion(config, { nextRelease: { version: "1.0.0" } }),
        false,
      );
    });

    test("does nothing without a release at all", async () => {
      assert.equal(await publishVersion(config, {}), false);
    });
  });
});
