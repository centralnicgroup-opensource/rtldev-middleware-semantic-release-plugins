import assert from "node:assert/strict";
import { describe, test } from "node:test";
import WhmcsMarketplacePlugin from "../../../src/plugins/whmcs-marketplace/plugin.js";
import resolveConfig from "../../../src/plugins/whmcs-marketplace/resolve-config.js";

const CREDENTIALS = {
  WHMCSMP_LOGIN: "release@example.test",
  WHMCSMP_PASSWORD: "secret",
  WHMCSMP_PRODUCTID: "4887",
};

function validate(env, pluginConfig = {}) {
  const plugin = new WhmcsMarketplacePlugin();
  return plugin.validateConfig(
    resolveConfig(pluginConfig, { env, cwd: "/workspace" }),
  );
}

function createLogger() {
  const messages = [];
  return {
    messages,
    log: (...args) => messages.push(args.join(" ")),
    error() {},
  };
}

describe("whmcs-marketplace plugin", () => {
  describe("validateConfig", () => {
    test("accepts a complete configuration", () => {
      assert.deepEqual(validate(CREDENTIALS), []);
    });

    test("reports missing credentials once, not once per variable", () => {
      assert.deepEqual(validate({ WHMCSMP_PRODUCTID: "4887" }), [
        "NoMarketplaceCredentials",
      ]);
    });

    test("reports a missing password", () => {
      assert.deepEqual(
        validate({
          WHMCSMP_LOGIN: "release@example.test",
          WHMCSMP_PRODUCTID: "1",
        }),
        ["NoMarketplaceCredentials"],
      );
    });

    test("reports a missing product id without also calling it invalid", () => {
      assert.deepEqual(
        validate({
          WHMCSMP_LOGIN: "release@example.test",
          WHMCSMP_PASSWORD: "secret",
        }),
        ["NoProductId"],
      );
    });

    for (const productId of ["abc", "12a", "-1", "1.5", "0"]) {
      test(`rejects the product id ${productId}`, () => {
        assert.deepEqual(
          validate({ ...CREDENTIALS, WHMCSMP_PRODUCTID: productId }),
          ["InvalidProductId"],
        );
      });
    }

    test("rejects a marketplace URL that is not a URL", () => {
      assert.deepEqual(
        validate({ ...CREDENTIALS, WHMCSMP_URL: "marketplace" }),
        ["InvalidMarketplaceUrl"],
      );
    });

    test("collects every problem at once", () => {
      assert.deepEqual(validate({ WHMCSMP_URL: "nope" }), [
        "NoMarketplaceCredentials",
        "NoProductId",
        "InvalidMarketplaceUrl",
      ]);
    });
  });

  describe("verifyConditions", () => {
    test("throws an aggregate of semantic-release errors", async () => {
      const plugin = new WhmcsMarketplacePlugin();

      await assert.rejects(
        plugin.verifyConditions({}, { env: {}, cwd: "/workspace" }),
        (error) => {
          const errors = error.errors ?? [error];
          assert.deepEqual(errors.map((inner) => inner.code).sort(), [
            "NoMarketplaceCredentials",
            "NoProductId",
          ]);
          assert.ok(errors.every((inner) => inner.details));
          return true;
        },
      );
    });
  });

  describe("hooks", () => {
    test("exposes prepare, which is what installs the browser", () => {
      assert.equal(typeof new WhmcsMarketplacePlugin().prepare, "function");
    });

    test("defers the browser check when prepare will install one", async () => {
      const plugin = new WhmcsMarketplacePlugin();
      const config = resolveConfig(
        { installBrowser: true, homeCacheDir: false },
        { env: { ...CREDENTIALS, PUPPETEER_CACHE_DIR: "/nowhere" }, cwd: "/w" },
      );

      // No browser anywhere, and verifyConditions runs before prepare, so this
      // must not be the thing that fails the release.
      await plugin.afterVerify(config, {}, { env: {}, logger: { log() {} } });
    });

    test("still fails fast when the browser is somebody else's job", async () => {
      const plugin = new WhmcsMarketplacePlugin();
      const config = resolveConfig(
        { installBrowser: false, homeCacheDir: false },
        { env: { ...CREDENTIALS, PUPPETEER_CACHE_DIR: "/nowhere" }, cwd: "/w" },
      );

      await assert.rejects(
        plugin.afterVerify(config, {}, { env: {}, logger: { log() {} } }),
        (error) => {
          assert.equal(error.code, "ChromeNotFound");
          return true;
        },
      );
    });
  });

  describe("fail", () => {
    test("says nothing was attempted when publish never ran", async () => {
      const plugin = new WhmcsMarketplacePlugin();
      const logger = createLogger();

      await plugin.fail({}, { logger });

      assert.match(
        logger.messages[0],
        /No WHMCS Marketplace publish was attempted/,
      );
    });

    test("reports a version that was published before the release failed", async () => {
      const plugin = new WhmcsMarketplacePlugin();
      const logger = createLogger();
      plugin.publishResult = { success: true, version: "1.2.3" };

      await plugin.fail({}, { logger });

      assert.match(logger.messages[0], /1\.2\.3 was published/);
    });

    test("reports a version that was not published", async () => {
      const plugin = new WhmcsMarketplacePlugin();
      const logger = createLogger();
      plugin.publishResult = { success: false, version: "1.2.3" };

      await plugin.fail({}, { logger });

      assert.match(logger.messages[0], /1\.2\.3 was not published/);
    });
  });
});
