import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readPublishedVersions } from "../../../src/plugins/whmcs-marketplace/marketplace-versions.js";
import { createFakePage, createFakeSession } from "./fake-page.js";

const VERSION_SELECTOR = "div#versions tr strong";

function createPage(labels) {
  return createFakePage({
    nodes: { [VERSION_SELECTOR]: labels.map((innerText) => ({ innerText })) },
  });
}

describe("whmcs-marketplace marketplace-versions", () => {
  test("strips the `Version ` label and returns oldest first", async () => {
    // The listing renders newest first.
    const page = createPage([
      "Version 1.2.3",
      "Version 1.2.2",
      "Version 1.2.1",
    ]);

    const versions = await readPublishedVersions(createFakeSession({ page }));

    assert.deepEqual(versions, ["1.2.1", "1.2.2", "1.2.3"]);
  });

  test("opens the product's versions tab", async () => {
    const page = createPage(["Version 1.0.0"]);

    await readPublishedVersions(createFakeSession({ page }));

    assert.equal(
      page.calls.find((call) => call.method === "goto").args[0],
      "https://marketplace.whmcs.test/product/4887/edit#versions",
    );
  });

  test("returns an empty list for a product without versions", async () => {
    const page = createPage([]);

    assert.deepEqual(
      await readPublishedVersions(createFakeSession({ page })),
      [],
    );
  });

  test("propagates a listing that never renders, for the caller to degrade", async () => {
    const page = createFakePage({ missingSelectors: [VERSION_SELECTOR] });

    await assert.rejects(readPublishedVersions(createFakeSession({ page })));
  });
});
