import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { removeVersion } from "../../../src/plugins/whmcs-marketplace/delete-version.js";
import deleteVersionOperation from "../../../src/plugins/whmcs-marketplace/delete-version.js";
import {
  createFakeElement,
  createFakePage,
  createFakeSession,
} from "./fake-page.js";

const CONFIRM_SELECTOR = "button.btn-styled-red";

function createVersionRow(version, { label = "Delete", withCell = true } = {}) {
  const deleteButton = createFakeElement({ textContent: label });
  const rightCell = createFakeElement({
    children: { "a.btn-styled-red": [deleteButton] },
  });

  const row = createFakeElement({
    textContent: `Version ${version} released 2026-09-01`,
    children: withCell ? { "td.text-right": rightCell } : {},
  });
  row.deleteButton = deleteButton;
  return row;
}

function createPage({ rows, alertResult = "success", rowsAfterDelete } = {}) {
  const page = createFakePage({
    alertResult,
    elements: {
      tr: rows,
      [CONFIRM_SELECTOR]: createFakeElement(),
    },
  });

  if (rowsAfterDelete) {
    let deleted = false;
    const original = page.$$.bind(page);
    page.$$ = async (selector) => {
      if (selector === "tr" && deleted) {
        return rowsAfterDelete;
      }

      if (selector === "tr") {
        deleted = true;
      }

      return original(selector);
    };
  }

  return page;
}

describe("whmcs-marketplace delete-version", () => {
  describe("removeVersion", () => {
    test("deletes the version and returns the product listing", async () => {
      const page = createPage({ rows: [createVersionRow("1.2.3")] });
      const session = createFakeSession({ page });

      const result = await removeVersion(session, "1.2.3");

      assert.deepEqual(result, {
        name: "WHMCS Marketplace Product Version",
        url: "https://marketplace.whmcs.test/product/4887",
      });
    });

    test("opens the product's versions tab", async () => {
      const page = createPage({ rows: [createVersionRow("1.2.3")] });

      await removeVersion(createFakeSession({ page }), "1.2.3");

      assert.equal(
        page.calls.find((call) => call.method === "goto").args[0],
        "https://marketplace.whmcs.test/product/4887/edit#versions",
      );
    });

    test("picks the row of the requested version", async () => {
      const wanted = createVersionRow("1.2.3");
      const other = createVersionRow("1.2.2");
      const page = createPage({ rows: [other, wanted] });

      await removeVersion(createFakeSession({ page }), "1.2.3");

      assert.equal(wanted.deleteButton.clicks, 1);
      assert.equal(other.deleteButton.clicks, 0);
    });

    test("returns false when the version is not listed", async () => {
      const page = createPage({ rows: [createVersionRow("9.9.9")] });

      assert.equal(
        await removeVersion(createFakeSession({ page }), "1.2.3"),
        false,
      );
    });

    test("returns false when the row has no action cell", async () => {
      const page = createPage({
        rows: [createVersionRow("1.2.3", { withCell: false })],
      });

      assert.equal(
        await removeVersion(createFakeSession({ page }), "1.2.3"),
        false,
      );
    });

    test("ignores buttons in the row that are not the delete button", async () => {
      const page = createPage({
        rows: [createVersionRow("1.2.3", { label: "Edit" })],
      });

      assert.equal(
        await removeVersion(createFakeSession({ page }), "1.2.3"),
        false,
      );
    });

    test("returns false when the listing answers with an error", async () => {
      const page = createPage({
        rows: [createVersionRow("1.2.3")],
        alertResult: "error",
      });

      assert.equal(
        await removeVersion(createFakeSession({ page }), "1.2.3"),
        false,
      );
    });

    test("accepts a delete without an alert when the row is gone", async () => {
      const page = createPage({
        rows: [createVersionRow("1.2.3")],
        alertResult: "none",
        rowsAfterDelete: [],
      });

      const result = await removeVersion(createFakeSession({ page }), "1.2.3");

      assert.equal(result.name, "WHMCS Marketplace Product Version");
    });

    test("fails a delete without an alert when the row is still there", async () => {
      const page = createPage({
        rows: [createVersionRow("1.2.3")],
        alertResult: "none",
      });

      assert.equal(
        await removeVersion(createFakeSession({ page }), "1.2.3"),
        false,
      );
    });
  });

  describe("deleteVersion operation", () => {
    const config = createFakeSession().config;

    test("does nothing without a version", async () => {
      assert.equal(await deleteVersionOperation(config, {}), false);
    });
  });
});
