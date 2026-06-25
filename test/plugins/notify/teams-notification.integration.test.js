import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { success } from "../../../src/plugins/notify/index.js";

const teamsTestNotificationUri = process.env.TEAMS_TEST_NOTIFICATION_URI;
const teamsTestNotificationEnabled =
  process.env.TEAMS_TEST_NOTIFICATION_ENABLED === "true";

function createContext() {
  return {
    logger: console,
    nextRelease: {
      type: "patch",
      version: "0.0.0-test",
      gitTag: "v0.0.0-test",
      notes:
        "**test:** Teams notification integration check ([abc1234](https://example.test/commit/abc1234))",
    },
    options: {
      repositoryUrl:
        "https://github.com/centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins.git",
    },
    env: {
      TEAMS_NOTIFICATION_URI: teamsTestNotificationUri,
      GITHUB_TOKEN: "test-github-token",
      npm_package_name:
        "@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins",
    },
    branch: {
      name: "main",
    },
  };
}

describe("Teams notification integration", () => {
  test(
    "posts to TEAMS_TEST_NOTIFICATION_URI when configured",
    {
      skip: teamsTestNotificationUri
        ? !teamsTestNotificationEnabled &&
          "Set TEAMS_TEST_NOTIFICATION_ENABLED=true to run the real Teams webhook test."
        : "Set TEAMS_TEST_NOTIFICATION_URI to run the real Teams webhook test.",
      timeout: 20_000,
    },
    async () => {
      const result = await success({}, createContext());

      assert.equal(result, "1");
    },
  );
});
