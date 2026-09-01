import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import githubReleases, {
  releaseVersion,
} from "../../../src/plugins/whmcs-marketplace/github-releases.js";

const CONFIG = {
  githubToken: "token-123",
  githubRepo: "acme/widgets",
  debug: false,
};

const CONTEXT = { logger: { log() {} } };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    json: async () => body,
  };
}

describe("whmcs-marketplace github-releases", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("releaseVersion", () => {
    test("strips a leading v from the release name", () => {
      assert.equal(releaseVersion({ name: "v1.2.3" }), "1.2.3");
    });

    test("falls back to the tag name", () => {
      assert.equal(releaseVersion({ tag_name: "v2.0.0" }), "2.0.0");
    });

    test("keeps a name that has no prefix", () => {
      assert.equal(releaseVersion({ name: "1.2.3" }), "1.2.3");
    });

    test("is empty for a release without either", () => {
      assert.equal(releaseVersion({}), "");
      assert.equal(releaseVersion(undefined), "");
    });
  });

  test("requests the repository's releases with the token", async () => {
    globalThis.fetch = mock.fn(async () => jsonResponse([]));

    await githubReleases(CONFIG, CONTEXT);

    const [url, options] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(
      url,
      "https://api.github.com/repos/acme/widgets/releases?per_page=100",
    );
    assert.equal(options.headers.Authorization, "Bearer token-123");
    assert.equal(options.headers.Accept, "application/vnd.github+json");
  });

  test("returns the releases oldest first", async () => {
    globalThis.fetch = mock.fn(async () =>
      jsonResponse([
        { name: "v1.2.3" },
        { name: "v1.2.2" },
        { name: "v1.2.1" },
      ]),
    );

    const releases = await githubReleases(CONFIG, CONTEXT);

    assert.deepEqual(releases.map(releaseVersion), ["1.2.1", "1.2.2", "1.2.3"]);
  });

  test("returns false on an API error", async () => {
    globalThis.fetch = mock.fn(async () =>
      jsonResponse({}, { ok: false, status: 404 }),
    );

    assert.equal(await githubReleases(CONFIG, CONTEXT), false);
  });

  test("returns false when the request itself fails", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("network unreachable");
    });

    assert.equal(await githubReleases(CONFIG, CONTEXT), false);
  });

  test("fails with a directed error without a token", async () => {
    globalThis.fetch = mock.fn();

    await assert.rejects(
      githubReleases({ ...CONFIG, githubToken: false }, CONTEXT),
      (error) => {
        assert.equal(error.code, "NoGithubToken");
        return true;
      },
    );
    assert.equal(globalThis.fetch.mock.callCount(), 0);
  });

  test("fails with a directed error without a repository", async () => {
    globalThis.fetch = mock.fn();

    await assert.rejects(
      githubReleases({ ...CONFIG, githubRepo: false }, CONTEXT),
      (error) => {
        assert.equal(error.code, "NoGithubRepo");
        return true;
      },
    );
  });
});
