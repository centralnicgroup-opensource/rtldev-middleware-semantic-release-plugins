import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { BUNDLED_COOKIE_EXTENSION } from "../../../src/plugins/whmcs-marketplace/resolve-config.js";
import { launchArgs } from "../../../src/plugins/whmcs-marketplace/session.js";
import { createConfig } from "./fake-page.js";

/**
 * The vendored cookie-banner extension is what keeps the Marketplace's consent
 * overlay off the login form. Chrome fails to launch outright on a malformed
 * unpacked extension, and that failure would first show up during a release, so
 * these checks guard the copy itself: that it is complete, that everything its
 * manifest points at is really there, and that it is packaged for publishing.
 */
const manifestPath = path.join(BUNDLED_COOKIE_EXTENSION, "manifest.json");

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function resolveInExtension(...segments) {
  return path.join(BUNDLED_COOKIE_EXTENSION, ...segments);
}

describe("whmcs-marketplace cookie extension", () => {
  test("is bundled with the plugin", () => {
    assert.ok(
      statSync(BUNDLED_COOKIE_EXTENSION).isDirectory(),
      `${BUNDLED_COOKIE_EXTENSION} is not a directory`,
    );
  });

  test("keeps the upstream licence next to the vendored code", () => {
    assert.ok(existsSync(resolveInExtension("LICENSE")));
  });

  test("has a manifest Chrome can load unpacked", () => {
    const manifest = readManifest();

    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.name, "the manifest has no name");
    assert.match(manifest.version, /^\d+(\.\d+)*$/);
  });

  test("ships the localisation its manifest resolves names from", () => {
    const manifest = readManifest();

    // The name and description are __MSG_*__ placeholders, so a missing
    // default locale is what makes Chrome reject the extension.
    assert.ok(manifest.default_locale);
    const messages = resolveInExtension(
      "_locales",
      manifest.default_locale,
      "messages.json",
    );
    assert.ok(existsSync(messages), `${messages} is missing`);

    for (const field of ["name", "description"]) {
      const placeholder = manifest[field]?.match(/^__MSG_(.+)__$/);
      if (placeholder) {
        assert.ok(
          JSON.parse(readFileSync(messages, "utf8"))[placeholder[1]],
          `${placeholder[1]} is not in ${manifest.default_locale} messages.json`,
        );
      }
    }
  });

  test("ships the background service worker", () => {
    const worker = readManifest().background?.service_worker;

    assert.ok(worker, "the manifest declares no service worker");
    assert.ok(existsSync(resolveInExtension(worker)), `${worker} is missing`);
  });

  test("ships every declarativeNetRequest ruleset, and they parse", () => {
    const rulesets = readManifest().declarative_net_request?.rule_resources;

    assert.ok(rulesets?.length, "the manifest declares no rulesets");
    for (const ruleset of rulesets) {
      const rulesPath = resolveInExtension(ruleset.path);
      assert.ok(existsSync(rulesPath), `${ruleset.path} is missing`);
      const rules = JSON.parse(readFileSync(rulesPath, "utf8"));
      assert.ok(
        Array.isArray(rules) && rules.length,
        `${ruleset.path} is empty`,
      );
    }
  });

  test("ships every page and icon the manifest points at", () => {
    const manifest = readManifest();
    const referenced = [
      manifest.options_ui?.page,
      manifest.action?.default_popup,
      ...Object.values(manifest.icons || {}),
      ...Object.values(manifest.action?.default_icon || {}),
    ].filter(Boolean);

    assert.ok(
      referenced.length > 3,
      "expected the manifest to reference assets",
    );
    for (const asset of referenced) {
      assert.ok(existsSync(resolveInExtension(asset)), `${asset} is missing`);
    }
  });

  test("is inside a published path, so consumers get it too", () => {
    const { files } = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    );
    const relative = path.relative(
      path.dirname(new URL("../../../package.json", import.meta.url).pathname),
      BUNDLED_COOKIE_EXTENSION,
    );

    assert.ok(
      files.some((entry) => relative.startsWith(entry.replace(/\/$/, ""))),
      `${relative} is not covered by package.json files: ${files.join(", ")}`,
    );
  });

  test("is excluded from Prettier, being third-party code", () => {
    const ignore = readFileSync(
      new URL("../../../.prettierignore", import.meta.url),
      "utf8",
    );

    assert.ok(
      ignore.split("\n").some((line) => line.trim().endsWith("extensions")),
      ".prettierignore does not exclude the vendored extensions",
    );
  });

  test("is handed to Chrome as an absolute path", () => {
    // Chrome resolves --load-extension against its own working directory, so a
    // relative path silently loads nothing.
    const args = launchArgs(createConfig());
    const loadExtension = args.find((arg) =>
      arg.startsWith("--load-extension="),
    );

    assert.ok(loadExtension);
    assert.ok(path.isAbsolute(loadExtension.split("=")[1]));
  });
});
