import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyCompatibleVersions,
  shouldCheckVersion,
} from "../../../src/plugins/whmcs-marketplace/compatible-versions.js";
import {
  createFakeElement,
  createFakePage,
  createFakeSession,
} from "./fake-page.js";

const CHECKBOX_SELECTOR = 'input[name="versionIds[]"]';
const SUBMIT_SELECTOR = 'div#compatibility button[type="submit"]';

function createPage({ classNames, alertResult = "success" }) {
  return createFakePage({
    alertResult,
    nodes: {
      [CHECKBOX_SELECTOR]: classNames.map((className) => ({ className })),
    },
    elements: { [SUBMIT_SELECTOR]: createFakeElement() },
  });
}

describe("whmcs-marketplace compatible-versions", () => {
  describe("shouldCheckVersion", () => {
    const cases = [
      ["8_10-abc", "7.10", true, "a newer major is compatible"],
      ["7_10-abc", "7.10", true, "the minimum itself is compatible"],
      ["7_11-abc", "7.10", true, "a newer minor is compatible"],
      ["7_9-abc", "7.10", false, "an older minor is not"],
      ["6_3-abc", "7.10", false, "an older major is not"],
      ["8_0-abc", "7.10", true, "a newer major wins over an older minor"],
      ["7_10", "7.10", true, "a class name without a suffix still parses"],
    ];

    for (const [className, minVersion, expected, why] of cases) {
      test(`${className} vs ${minVersion}: ${why}`, () => {
        assert.equal(shouldCheckVersion(className, minVersion), expected);
      });
    }

    test("treats unparseable parts as zero rather than throwing", () => {
      assert.equal(shouldCheckVersion("x_y-abc", "7.10"), false);
      assert.equal(shouldCheckVersion("8_x-abc", "7.10"), true);
    });
  });

  describe("applyCompatibleVersions", () => {
    test("ticks the compatible versions and leaves the rest alone", async () => {
      const classNames = ["6_3-a", "7_9-b", "7_10-c", "8_0-d"];
      const page = createPage({ classNames });
      const session = createFakeSession({
        page,
        config: { minVersion: "7.10" },
      });

      const result = await applyCompatibleVersions(session);

      assert.deepEqual(
        page.calls
          .filter((call) => call.method === "$$eval")
          .map((call) => call.args[0]),
        [CHECKBOX_SELECTOR, CHECKBOX_SELECTOR],
        "reads the class names, then writes the checked state",
      );
      assert.deepEqual(
        page.state.values.size,
        0,
        "nothing is typed into the compatibility form",
      );
      assert.equal(result.name, "WHMCS Marketplace Compatibility Update");
      assert.match(result.url, /\/product\/4887\/edit#compatibility$/);
    });

    test("sets the checked state on every checkbox it read", async () => {
      const classNames = ["6_3-a", "7_10-b", "9_1-c"];
      const nodes = classNames.map((className) => ({ className }));
      const page = createFakePage({
        nodes: { [CHECKBOX_SELECTOR]: nodes },
        elements: { [SUBMIT_SELECTOR]: createFakeElement() },
      });
      const session = createFakeSession({
        page,
        config: { minVersion: "7.10" },
      });

      await applyCompatibleVersions(session);

      assert.deepEqual(
        nodes.map((node) => node.checked),
        [false, true, true],
      );
    });

    test("navigates to the product's compatibility tab", async () => {
      const page = createPage({ classNames: ["7_10-a"] });
      const session = createFakeSession({
        page,
        config: { minVersion: "7.10" },
      });

      await applyCompatibleVersions(session);

      assert.equal(
        page.calls.find((call) => call.method === "goto").args[0],
        "https://marketplace.whmcs.test/product/4887/edit#compatibility",
      );
    });

    test("returns false when the form answers with an error", async () => {
      const page = createPage({ classNames: ["7_10-a"], alertResult: "error" });
      const session = createFakeSession({
        page,
        config: { minVersion: "7.10" },
      });

      assert.equal(await applyCompatibleVersions(session), false);
    });

    test("returns false when no alert appears at all", async () => {
      const page = createPage({ classNames: ["7_10-a"], alertResult: "none" });
      const session = createFakeSession({
        page,
        config: { minVersion: "7.10" },
      });

      assert.equal(await applyCompatibleVersions(session), false);
    });
  });
});
