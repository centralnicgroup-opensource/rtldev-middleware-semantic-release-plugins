import assert from "node:assert/strict";
import { describe, test } from "node:test";
import getRepoInfo from "../../../src/plugins/notify/get-repo-info.js";

function assertRepoInfo(repositoryUrl, path, URL, hostname) {
  assert.deepEqual(getRepoInfo(repositoryUrl), { path, URL, hostname });
}

describe("getRepoInfo", () => {
  test("works for GitHub SSH URLs", () => {
    assertRepoInfo(
      "ssh://git@github.com:hello/world.git",
      "hello/world",
      "https://github.com/hello/world",
      "github.com",
    );
  });

  test("works for Bitbucket SSH URLs", () => {
    assertRepoInfo(
      "ssh://hg@bitbucket.org/hello/world.git",
      "hello/world",
      "https://bitbucket.org/hello/world",
      "bitbucket.org",
    );
  });

  test("works for GitLab SSH URLs", () => {
    assertRepoInfo(
      "ssh://git@gitlab.com:hello/world.git",
      "hello/world",
      "https://gitlab.com/hello/world",
      "gitlab.com",
    );
  });

  test("works for HTTPS repo URLs", () => {
    assertRepoInfo(
      "https://github.com/hello/world.git",
      "hello/world",
      "https://github.com/hello/world",
      "github.com",
    );
  });

  test("works for git@ repo URLs", () => {
    assertRepoInfo(
      "git@github.com:hello/world.git",
      "hello/world",
      "https://github.com/hello/world",
      "github.com",
    );
  });

  test("works for repo URLs with other top-level domains", () => {
    assertRepoInfo(
      "git@github.pl:hello/world.git",
      "hello/world",
      "https://github.pl/hello/world",
      "github.pl",
    );
  });
});
