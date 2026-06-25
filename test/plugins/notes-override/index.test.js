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

  test("strips markdown links from generated notes", async () => {
    const notes = await generateNotes(
      {
        notes:
          "Release ([abc1234](https://example.test/commit/abc1234)) and [ticket](https://example.test/ticket)",
      },
      { env: {} },
    );

    assert.equal(notes, "Release abc1234 and ticket");
  });
});
