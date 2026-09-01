import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assertCookieExtension,
  launchArgs,
} from "../../../src/plugins/whmcs-marketplace/session.js";
import { BUNDLED_COOKIE_EXTENSION } from "../../../src/plugins/whmcs-marketplace/resolve-config.js";
import { createConfig } from "./fake-page.js";

describe("whmcs-marketplace session", () => {
  describe("launchArgs", () => {
    test("runs Chrome sandbox-free, as CI containers require", () => {
      const args = launchArgs(createConfig());

      assert.ok(args.includes("--no-sandbox"));
      assert.ok(args.includes("--disable-setuid-sandbox"));
    });

    test("loads the cookie-banner extension by default", () => {
      const args = launchArgs(createConfig());

      assert.ok(args.includes(`--load-extension=${BUNDLED_COOKIE_EXTENSION}`));
      assert.ok(
        args.includes(
          `--disable-extensions-except=${BUNDLED_COOKIE_EXTENSION}`,
        ),
      );
    });

    test("leaves the extension out when it is turned off", () => {
      const args = launchArgs(createConfig({ useCookieExtension: false }));

      assert.ok(!args.some((arg) => arg.startsWith("--load-extension")));
    });

    test("appends the configured extra arguments", () => {
      const args = launchArgs(
        createConfig({ launchArgs: ["--window-size=800,600"] }),
      );

      assert.ok(args.includes("--window-size=800,600"));
    });
  });

  describe("assertCookieExtension", () => {
    test("accepts the bundled extension", () => {
      assertCookieExtension(createConfig());
    });

    test("fails with a directed error for a path that is not there", () => {
      assert.throws(
        () =>
          assertCookieExtension(
            createConfig({ cookieExtensionPath: "/nowhere/extension" }),
          ),
        (error) => {
          assert.equal(error.code, "CookieExtensionNotFound");
          return true;
        },
      );
    });

    test("does not look for an extension that is turned off", () => {
      assertCookieExtension(
        createConfig({
          useCookieExtension: false,
          cookieExtensionPath: "/nowhere/extension",
        }),
      );
    });
  });
});
