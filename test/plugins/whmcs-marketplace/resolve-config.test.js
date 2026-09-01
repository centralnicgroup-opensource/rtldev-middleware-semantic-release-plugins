import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import resolveConfig, {
  BUNDLED_COOKIE_EXTENSION,
} from "../../../src/plugins/whmcs-marketplace/resolve-config.js";

const CREDENTIALS = {
  WHMCSMP_LOGIN: "release@example.test",
  WHMCSMP_PASSWORD: "secret",
  WHMCSMP_PRODUCTID: "4887",
};

function resolve(env = {}, pluginConfig = {}, cwd = "/workspace") {
  return resolveConfig(pluginConfig, { env, cwd });
}

describe("whmcs-marketplace resolve-config", () => {
  test("applies defaults for a minimal environment", () => {
    const config = resolve(CREDENTIALS);

    assert.equal(config.urlBase, "https://marketplace.whmcs.com");
    assert.equal(config.login, "release@example.test");
    assert.equal(config.password, "secret");
    assert.equal(config.productId, "4887");
    assert.equal(config.minVersion, "7.10");
    assert.equal(config.githubToken, false);
    assert.equal(config.githubRepo, false);
    assert.equal(config.headless, true);
    assert.equal(config.executablePath, false);
    assert.equal(config.keepBrowserOpenOnError, false);
    assert.equal(config.useCookieExtension, true);
    assert.equal(config.installBrowser, true);
    assert.equal(config.skipOsDeps, false);
    assert.deepEqual(config.browserInstallCommand, []);
    assert.equal(config.setCompatibleVersions, true);
    assert.equal(config.debug, false);
    assert.deepEqual(config.launchArgs, []);
    assert.deepEqual(config.timeouts, {
      goto: 30000,
      navigation: 30000,
      selector: 15000,
      settle: 200,
      cookieBanner: 2000,
    });
  });

  test("missing credentials resolve to false rather than undefined", () => {
    const config = resolve();

    assert.equal(config.login, false);
    assert.equal(config.password, false);
    assert.equal(config.productId, false);
  });

  test("environment variables take precedence over the plugin configuration", () => {
    const config = resolve(
      { ...CREDENTIALS, WHMCSMP_MINVERSION: "8.0" },
      { login: "ignored@example.test", minVersion: "7.0", productId: "1" },
    );

    assert.equal(config.login, "release@example.test");
    assert.equal(config.productId, "4887");
    assert.equal(config.minVersion, "8.0");
  });

  test("the plugin configuration fills in what the environment does not set", () => {
    const config = resolve(CREDENTIALS, {
      minVersion: "8.2",
      githubRepo: "acme/widgets",
      launchArgs: ["--window-size=1280,1024"],
      timeouts: { selector: 5000 },
    });

    assert.equal(config.minVersion, "8.2");
    assert.equal(config.githubRepo, "acme/widgets");
    assert.deepEqual(config.launchArgs, ["--window-size=1280,1024"]);
    assert.equal(config.timeouts.selector, 5000);
    assert.equal(config.timeouts.goto, 30000);
    assert.equal(config.timeouts.settle, 200);
  });

  test("GH_TOKEN and GITHUB_TOKEN both provide the GitHub token", () => {
    assert.equal(resolve({ GH_TOKEN: "a" }).githubToken, "a");
    assert.equal(resolve({ GITHUB_TOKEN: "b" }).githubToken, "b");
    assert.equal(
      resolve({ GH_TOKEN: "a", GITHUB_TOKEN: "b" }).githubToken,
      "a",
    );
  });

  describe("boolean environment variables", () => {
    for (const value of ["0", "false", "no", "off", "FALSE"]) {
      test(`treats PUPPETEER_HEADLESS=${value} as disabled`, () => {
        assert.equal(resolve({ PUPPETEER_HEADLESS: value }).headless, false);
      });
    }

    for (const value of ["1", "true", "yes"]) {
      test(`treats PUPPETEER_HEADLESS=${value} as enabled`, () => {
        assert.equal(resolve({ PUPPETEER_HEADLESS: value }).headless, true);
      });
    }

    test("an empty value falls through to the default", () => {
      assert.equal(resolve({ PUPPETEER_HEADLESS: "" }).headless, true);
    });

    test("useCookieExtension can be disabled from the plugin configuration", () => {
      assert.equal(
        resolve({}, { useCookieExtension: false }).useCookieExtension,
        false,
      );
    });

    test("WHMCSMP_SKIP_OS_DEPS=1 leaves apt alone", () => {
      assert.equal(resolve({ WHMCSMP_SKIP_OS_DEPS: "1" }).skipOsDeps, true);
    });

    test("WHMCSMP_INSTALL_BROWSER=0 leaves the browser to somebody else", () => {
      assert.equal(
        resolve({ WHMCSMP_INSTALL_BROWSER: "0" }).installBrowser,
        false,
      );
    });

    test("WHMCSMP_COOKIE_EXTENSION=0 disables the extension", () => {
      assert.equal(
        resolve({ WHMCSMP_COOKIE_EXTENSION: "0" }).useCookieExtension,
        false,
      );
    });

    test("PUPPETEER_KEEP_OPEN=1 keeps the browser open on failure", () => {
      assert.equal(
        resolve({ PUPPETEER_KEEP_OPEN: "1" }).keepBrowserOpenOnError,
        true,
      );
    });
  });

  describe("puppeteer cache directory", () => {
    test("defaults to a cache below the working directory", () => {
      assert.equal(
        resolve({}, {}, "/workspace").cacheDir,
        path.join("/workspace", ".cache", "puppeteer"),
      );
    });

    test("PROJECT_WORKDIR wins over the working directory", () => {
      assert.equal(
        resolve({ PROJECT_WORKDIR: "/usr/share/project" }, {}, "/workspace")
          .cacheDir,
        path.join("/usr/share/project", ".cache", "puppeteer"),
      );
    });

    test("keeps the user's own puppeteer cache as a last resort", () => {
      assert.ok(
        resolve().homeCacheDir.endsWith(path.join(".cache", "puppeteer")),
      );
    });

    test("the home cache can be turned off, which the tests rely on", () => {
      assert.equal(resolve({}, { homeCacheDir: false }).homeCacheDir, false);
    });

    test("PUPPETEER_CACHE_DIR wins over both", () => {
      assert.equal(
        resolve(
          {
            PROJECT_WORKDIR: "/usr/share/project",
            PUPPETEER_CACHE_DIR: "/cache",
          },
          {},
          "/workspace",
        ).cacheDir,
        "/cache",
      );
    });
  });

  describe("cookie extension path", () => {
    test("defaults to the bundled extension", () => {
      assert.equal(resolve().cookieExtensionPath, BUNDLED_COOKIE_EXTENSION);
      assert.ok(
        BUNDLED_COOKIE_EXTENSION.endsWith("I-Still-Dont-Care-About-Cookies"),
      );
    });

    test("a configured path is resolved against the working directory", () => {
      assert.equal(
        resolve({}, { cookieExtensionPath: "vendor/ext" }, "/workspace")
          .cookieExtensionPath,
        path.join("/workspace", "vendor", "ext"),
      );
    });
  });

  describe("debug", () => {
    test("is enabled by the plugin's own namespace", () => {
      assert.equal(
        resolve({ DEBUG: "semantic-release:whmcs-marketplace" }).debug,
        true,
      );
    });

    test("is not enabled by the predecessor plugin's namespace", () => {
      // Deliberately not accepted: one name per setting.
      assert.equal(resolve({ DEBUG: "semantic-release:whmcs" }).debug, false);
    });

    test("is enabled by the wildcard namespace", () => {
      assert.equal(resolve({ DEBUG: "semantic-release:*" }).debug, true);
    });

    test("is not enabled by another plugin's namespace", () => {
      assert.equal(
        resolve({ DEBUG: "semantic-release:whmcs-build" }).debug,
        false,
      );
    });
  });
});
