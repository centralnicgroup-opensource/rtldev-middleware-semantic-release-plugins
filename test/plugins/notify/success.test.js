import assert from "node:assert/strict";
import { afterEach, describe, test, mock } from "node:test";
import {
  success,
  verifyConditions,
} from "../../../src/plugins/notify/index.js";

const originalFetch = globalThis.fetch;

function getBaseConfig(packageName = "Internal Test") {
  return {
    notifyOnSuccess: true,
    notifyOnFail: true,
    markdownReleaseNotes: true,
    packageName,
  };
}

function getContext(branchName = "main") {
  const version = "2.0.0";

  return {
    logger: {
      log: mock.fn(),
      warn: mock.fn(),
    },
    nextRelease: {
      type: "patch",
      version,
      gitTag: `v${version}`,
      notes: "**fix:** hello ([abc1234](https://example.test/commit/abc1234))",
    },
    options: {
      repositoryUrl:
        "git+https://github.com/centralnicgroup-opensource/rtldev-middleware-semantic-release-notify-plugin.git",
    },
    env: {
      npm_package_name: "internal test",
      TEAMS_NOTIFICATION_URI: "https://example.test/teams-webhook",
      GITHUB_TOKEN: "test-github-token",
      DEBUG: "semantic-release:teams-notify",
    },
    branch: {
      name: branchName,
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("teams notification", () => {
  test("verifies required notification settings", async () => {
    await assert.doesNotReject(() =>
      verifyConditions(getBaseConfig(), getContext()),
    );
  });

  test("posts success notifications", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => "1",
    }));

    const response = await success(
      getBaseConfig("internal testing"),
      getContext(),
    );

    assert.equal(response, "1");
    assert.equal(globalThis.fetch.mock.callCount(), 1);
    const [url, options] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, "https://example.test/teams-webhook");
    assert.equal(options.method, "POST");
    assert.match(options.body, /internal test/);

    const payload = JSON.parse(options.body);
    assert.equal(payload.type, "message");
    assert.equal(
      payload.attachments[0].contentType,
      "application/vnd.microsoft.card.adaptive",
    );
    assert.equal(payload.attachments[0].contentUrl, null);
    assert.equal(payload.attachments[0].content.type, "AdaptiveCard");
    assert.equal(payload.attachments[0].content.version, "1.2");
  });

  test("accepts successful Teams responses with empty bodies", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => "",
    }));

    const response = await success(
      getBaseConfig("internal testing"),
      getContext(),
    );

    assert.equal(response, "1");
  });
});
