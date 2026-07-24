import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  generateNotes,
  verifyConditions,
} from "../../../src/plugins/notes-override/index.js";
import resolveConfig from "../../../src/plugins/notes-override/resolve-config.js";

describe("notes-override", () => {
  test("resolves notes from plugin config before environment", () => {
    assert.deepEqual(
      resolveConfig(
        { notes: "configured notes" },
        { env: { customReleaseNotes: "environment notes" } },
      ),
      { notes: "configured notes", debug: false },
    );
  });

  test("rejects missing release notes", async () => {
    await assert.rejects(
      () => verifyConditions({}, { env: {}, logger: { log() {} } }),
      (error) =>
        error instanceof AggregateError &&
        error.errors.some(({ code }) => code === "ReleaseNotesNotFound"),
    );
  });

  test("strips internal release links but preserves documentation links", async () => {
    const notes = await generateNotes(
      {
        notes:
          "Release ([abc1234](https://example.test/commit/abc1234)), closes [#123](https://example.test/issues/123), Jira [RSRMID-2889](https://centralnic.atlassian.net/browse/RSRMID-2889), see [docs](https://docs.example.test/guide)",
      },
      { env: {} },
    );

    assert.equal(
      notes,
      "Release , closes #123, Jira RSRMID-2889, see [docs](https://docs.example.test/guide)",
    );
  });
});
