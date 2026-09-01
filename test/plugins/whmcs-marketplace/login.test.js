import assert from "node:assert/strict";
import { describe, test } from "node:test";
import MarketplaceSession from "../../../src/plugins/whmcs-marketplace/session.js";
import { ERROR_SELECTOR } from "../../../src/plugins/whmcs-marketplace/page-utils.js";
import { createConfig, createFakePage } from "./fake-page.js";

/**
 * A failed login is the most likely way a marketplace publish goes wrong, and
 * every operation swallows it into a `false`. These check the reason survives
 * that: `report` puts it in the release log, where it is the only evidence
 * anyone will have.
 */
const ACCOUNT_SELECTOR = ".account-navbar";

function createSession({ page, config = {} } = {}) {
  const logged = [];
  const context = {
    env: {},
    logger: { log: (...args) => logged.push(args.join(" ")), error() {} },
  };
  const session = new MarketplaceSession(
    createConfig({ timeouts: { selector: 150 }, ...config }),
    context,
    { browser: { async close() {} }, page: page || createFakePage() },
  );
  session.logged = logged;
  return session;
}

describe("whmcs-marketplace login", () => {
  test("succeeds when the Marketplace redirects to the account page", async () => {
    const session = createSession({
      page: createFakePage({
        missingSelectors: [ACCOUNT_SELECTOR, ERROR_SELECTOR],
        urlAfterClick: "https://marketplace.whmcs.test/account",
      }),
    });

    assert.equal(await session.login(), true);
    assert.equal(session.failureReason, "");
    assert.deepEqual(session.logged, []);
  });

  test("succeeds when the account navigation appears without a redirect", async () => {
    const session = createSession({ page: createFakePage() });

    assert.equal(await session.login(), true);
    assert.equal(session.failureReason, "");
  });

  test("reports the Marketplace's own message when the login is rejected", async () => {
    const session = createSession({
      page: createFakePage({
        missingSelectors: [ACCOUNT_SELECTOR],
        alertResult: "error",
        alertText: "Invalid email address or password.",
      }),
    });

    assert.equal(await session.login(), false);
    assert.match(
      session.failureReason,
      /rejected the login for release@example.test/,
    );
    assert.match(session.failureReason, /Invalid email address or password\./);
    assert.match(
      session.logged.join("\n"),
      /WHMCS Marketplace: .*Invalid email/,
    );
  });

  test("names the page when the login neither succeeds nor errors", async () => {
    const session = createSession({
      page: createFakePage({
        missingSelectors: [ACCOUNT_SELECTOR, ERROR_SELECTOR],
      }),
    });

    assert.equal(await session.login(), false);
    assert.match(
      session.failureReason,
      /neither succeeded nor reported an error/,
    );
    assert.match(
      session.failureReason,
      /URL: https:\/\/marketplace\.whmcs\.test/,
    );
    assert.match(session.failureReason, /title: "Log in - WHMCS Marketplace"/);
  });

  test("reports an interstitial served instead of the login form", async () => {
    // A bot check or an outage page is what a missing form really looks like,
    // and in CI that is far likelier than a wrong password.
    const session = createSession({
      page: createFakePage({
        missingSelectors: ["#email", "#password"],
        title: "Just a moment...",
      }),
    });

    assert.equal(await session.login(), false);
    assert.match(session.failureReason, /the login form never appeared/);
    assert.match(session.failureReason, /Just a moment\.\.\./);
  });

  test("reports missing credentials without opening the login page", async () => {
    const page = createFakePage();
    const session = createSession({
      page,
      config: { login: false, password: false },
    });

    assert.equal(await session.login(), false);
    assert.match(session.failureReason, /no credentials configured/);
    assert.deepEqual(page.calls, [], "expected no navigation at all");
  });

  test("reports a login form that will not take the account name", async () => {
    const page = createFakePage({ missingSelectors: [ACCOUNT_SELECTOR] });
    // Typing lands nowhere, as a field behind an overlay does.
    page.type = async () => {};
    page.evaluate = async () => {};
    const session = createSession({ page });

    assert.equal(await session.login(), false);
    assert.match(session.failureReason, /did not accept the account name/);
  });

  test("reports the error when the login page never loads", async () => {
    const page = createFakePage();
    page.goto = async () => {
      throw new Error("net::ERR_NAME_NOT_RESOLVED");
    };
    const session = createSession({ page });

    assert.equal(await session.login(), false);
    assert.match(session.failureReason, /ERR_NAME_NOT_RESOLVED/);
  });

  test("does not log the password", async () => {
    const session = createSession({
      page: createFakePage({
        missingSelectors: [ACCOUNT_SELECTOR],
        alertResult: "error",
        alertText: "Invalid email address or password.",
      }),
    });

    await session.login();

    assert.ok(!session.logged.join("\n").includes(session.config.password));
    assert.ok(!session.failureReason.includes(session.config.password));
  });
});
