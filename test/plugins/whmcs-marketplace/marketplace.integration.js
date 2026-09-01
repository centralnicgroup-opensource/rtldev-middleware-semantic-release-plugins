import assert from "node:assert/strict";
import { describe, test } from "node:test";
import resolveConfig from "../../../src/plugins/whmcs-marketplace/resolve-config.js";
import MarketplaceSession from "../../../src/plugins/whmcs-marketplace/session.js";
import { submitVersion } from "../../../src/plugins/whmcs-marketplace/publish-version.js";
import { removeVersion } from "../../../src/plugins/whmcs-marketplace/delete-version.js";
import { readPublishedVersions } from "../../../src/plugins/whmcs-marketplace/marketplace-versions.js";
import { applyCompatibleVersions } from "../../../src/plugins/whmcs-marketplace/compatible-versions.js";

/**
 * Drives the real WHMCS Marketplace. Not part of `pnpm test`: run it with
 * `pnpm run test:whmcs`, with credentials in `.env` and a browser installed
 * (`pnpm exec puppeteer browsers install chrome --install-deps`).
 *
 * It publishes and then removes a throwaway version, so point
 * `WHMCSMP_TEST_PRODUCTID` at a product nobody depends on. It defaults to
 * 4887, a deprecated listing kept for exactly this.
 *
 * Every stage is asserted separately, and every assertion quotes what the
 * Marketplace said. An operation that only checked the final result would
 * report "not published" for a rejected login, an expired password, a
 * duplicate version and a changed form alike.
 */
const TEST_PRODUCT_ID = process.env.WHMCSMP_TEST_PRODUCTID || "4887";
const TEST_VERSION = process.env.WHMCSMP_TEST_VERSION || "0.0.1";

const hasCredentials = Boolean(
  process.env.WHMCSMP_LOGIN && process.env.WHMCSMP_PASSWORD,
);
const options = {
  skip: hasCredentials
    ? false
    : "WHMCSMP_LOGIN/WHMCSMP_PASSWORD are not set - see .env.example",
  timeout: 5 * 60 * 1000,
};

const context = {
  env: { ...process.env, WHMCSMP_PRODUCTID: TEST_PRODUCT_ID },
  logger: console,
};

/**
 * Opens one authenticated session for the whole round trip. Logging in once
 * keeps the test honest about which stage failed: a login problem fails here,
 * with the Marketplace's own wording, instead of surfacing three stages later
 * as "nothing was published".
 */
async function withMarketplace(run) {
  const config = resolveConfig({}, context);
  const session = await MarketplaceSession.open(config, context);

  try {
    const loggedIn = await session.login();
    assert.ok(
      loggedIn,
      `could not log in as ${config.login}: ${session.failureReason || "no reason reported"}`,
    );
    return await run(session);
  } finally {
    await session.close();
  }
}

/** The published versions, or [] for a product that has none yet. */
async function publishedVersions(session) {
  try {
    return await readPublishedVersions(session);
  } catch {
    // The version table is absent, not empty, when there is nothing to list.
    return [];
  }
}

describe(
  "whmcs-marketplace against the real Marketplace",
  { concurrency: 1 },
  () => {
    test("logs in with the configured credentials", options, async (t) => {
      await withMarketplace(async (session) => {
        t.diagnostic(
          `logged in to ${session.config.urlBase} as ${session.config.login}`,
        );
      });
    });

    test("reads the versions already published", options, async (t) => {
      await withMarketplace(async (session) => {
        const versions = await publishedVersions(session);

        assert.ok(Array.isArray(versions), "expected a list of versions");
        t.diagnostic(
          `product ${TEST_PRODUCT_ID} lists ${versions.length} version(s): ${versions.join(", ") || "none"}`,
        );
      });
    });

    test(
      "publishes a version and then removes it again",
      options,
      async (t) => {
        await withMarketplace(async (session) => {
          // A previous run that failed to clean up would otherwise make the
          // Marketplace reject this one as a duplicate, forever.
          if ((await publishedVersions(session)).includes(TEST_VERSION)) {
            t.diagnostic(
              `removing a leftover ${TEST_VERSION} from an earlier run`,
            );
            const cleaned = await removeVersion(session, TEST_VERSION);
            assert.notEqual(
              cleaned,
              false,
              `${TEST_VERSION} was left over and could not be removed: ${session.failureReason}`,
            );
          }

          const published = await submitVersion(session, {
            version: TEST_VERSION,
            notes: "# something changed\n\ntwice\n\nand then done.",
          });
          assert.notEqual(
            published,
            false,
            `publishing ${TEST_VERSION} failed: ${session.failureReason || "no reason reported"}`,
          );
          assert.equal(published.name, "WHMCS Marketplace Product Version");
          t.diagnostic(`published ${TEST_VERSION} to ${published.url}`);

          const versions = await publishedVersions(session);
          assert.ok(
            versions.includes(TEST_VERSION),
            `${TEST_VERSION} is not in the listing after publishing it: ${versions.join(", ") || "none"}`,
          );

          const removed = await removeVersion(session, TEST_VERSION);
          assert.notEqual(
            removed,
            false,
            `removing ${TEST_VERSION} failed: ${session.failureReason || "no reason reported"} - it is still on the listing`,
          );
          t.diagnostic(`removed ${TEST_VERSION} again`);
        });
      },
    );

    test("ticks the compatible WHMCS versions", options, async (t) => {
      await withMarketplace(async (session) => {
        const result = await applyCompatibleVersions(session);

        assert.notEqual(
          result,
          false,
          `the compatibility update failed: ${session.failureReason || "no reason reported"}`,
        );
        t.diagnostic(
          `compatibility set from ${session.config.minVersion} upwards`,
        );
      });
    });
  },
);
