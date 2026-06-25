import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import * as replacePlugin from "../../../src/plugins/replace/index.js";
import { prepare } from "../../../src/plugins/replace/index.js";

const context = {
  logger: {
    log() {},
    warn() {},
  },
  lastRelease: {
    version: "1.0.0",
    gitTag: "v1.0.0",
  },
  nextRelease: {
    type: "patch",
    version: "2.0.0",
    gitTag: "v2.0.0",
    notes: "These are the release notes for the next release.",
  },
};

let fixtureDir;

async function writeFixtures(directory) {
  await mkdir(path.join(directory, "modules/addons/cnicdnsmanager"), {
    recursive: true,
  });
  await writeFile(path.join(directory, "__init__.py"), '__VERSION__ = "1.0.0"');
  await writeFile(path.join(directory, "build.gradle"), "version = '1.0.0'");
  await writeFile(
    path.join(directory, "foo.md"),
    [
      "install with `npm i foo@1.0.0`",
      "install with `yarn add foo@1.0.0`",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(directory, "modules/addons/cnicdnsmanager/whmcs.json"),
    JSON.stringify({ version: "1.0.0" }, null, 2),
  );
}

async function assertFileContents(name, expected) {
  const actual = await readFile(path.join(fixtureDir, name), "utf8");
  assert.equal(actual, expected);
}

async function assertFileContentsContain(name, expected) {
  const actual = await readFile(path.join(fixtureDir, name), "utf8");
  assert.match(
    actual,
    new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}

describe("replace plugin", () => {
  beforeEach(async () => {
    fixtureDir = await mkdtemp(
      path.join(tmpdir(), "semantic-release-replace-"),
    );
    await writeFixtures(fixtureDir);
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  test("exposes prepare", () => {
    assert.equal(typeof replacePlugin.prepare, "function");
  });

  test("prepare replaces using regex strings", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "*.py")],
        from: '__VERSION__ = ".*"',
        to: '__VERSION__ = "${nextRelease.version}"',
      },
      {
        files: [path.join(fixtureDir, "build.gradle")],
        from: "version = '.*'",
        to: "version = '${nextRelease.version}'",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("__init__.py", '__VERSION__ = "2.0.0"');
    await assertFileContents("build.gradle", "version = '2.0.0'");
  });

  test("prepare validates expected replacement results", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "*.py")],
        from: '__VERSION__ = "1.0.0"',
        to: '__VERSION__ = "${nextRelease.version}"',
        results: [
          {
            file: path.join(fixtureDir, "__init__.py"),
            hasChanged: true,
            numMatches: 1,
            numReplacements: 1,
          },
        ],
        countMatches: true,
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("__init__.py", '__VERSION__ = "2.0.0"');
  });

  test("prepare throws when expected replacement results differ", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "*")],
        from: '__VERSION__ = "1.0.0"',
        to: '__VERSION__ = "${nextRelease.version}"',
        results: [],
        countMatches: true,
      },
    ];

    await assert.rejects(
      () => prepare({ replacements }, context),
      /Replacement validation failed/,
    );
  });

  test("string replacements are global", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "*.md")],
        from: "foo@.*",
        to: 'foo@"${nextRelease.version}"',
        results: [
          {
            file: path.join(fixtureDir, "foo.md"),
            hasChanged: true,
            numMatches: 2,
            numReplacements: 2,
          },
        ],
        countMatches: true,
      },
    ];

    await prepare({ replacements }, context);
  });

  test("prepare replaces using functions", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "*.py")],
        from: '__VERSION__ = ".*"',
        to: () => "__VERSION__ = 2",
      },
      {
        files: [path.join(fixtureDir, "build.gradle")],
        from: "version = '.*'",
        to: () => "version = 2",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("__init__.py", "__VERSION__ = 2");
    await assertFileContents("build.gradle", "version = 2");
  });

  test("prepare accepts regular expressions for from", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: /yarn(.+?)@.*/g,
        to: "yarn add foo@${nextRelease.version}",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm i foo@1.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@2.0.0");
  });

  test("prepare accepts callback functions for from", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: (filename) => `${path.basename(filename, ".md")}@1.0.0`,
        to: "foo@${nextRelease.version}",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm i foo@2.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
  });

  test("prepare accepts multi-argument to callbacks for regular expression from", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: /npm i (.+)@(.+)`/g,
        to: (match, packageName, version) =>
          match
            .replace(version, context.nextRelease.version)
            .replace(packageName, packageName.split("").reverse().join("")),
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm i oof@2.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
  });

  test("prepare passes context as the final from callback argument", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: (_filename, callbackContext) =>
          new RegExp(callbackContext.lastRelease.version, "g"),
        to: "3.0.0",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm i foo@3.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@3.0.0");
  });

  test("prepare passes context as the final to callback argument", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: /npm i (.*)@(.*)`/,
        to: (_match, packageName, ...args) => {
          const callbackContext = args.pop();
          return `npm i ${packageName.split("").reverse().join("")}@${callbackContext.nextRelease.version}`;
        },
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm i oof@2.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
  });

  test("prepare accepts an array of from matchers", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: [
          "1.0.0",
          /install with/,
          (filename) => path.basename(filename, ".md"),
        ],
        to: "bar",
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "bar `npm i bar@bar`");
    await assertFileContentsContain(
      "foo.md",
      "install with `yarn add foo@bar`",
    );
  });

  test("prepare accepts an array of to replacements", async () => {
    const replacements = [
      {
        files: [path.join(fixtureDir, "foo.md")],
        from: ["npm i", "1.0.0"],
        to: [
          "npm install",
          (...args) => {
            const callbackContext = args.pop();
            return callbackContext.nextRelease.version;
          },
        ],
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain("foo.md", "npm install foo@2.0.0");
    await assertFileContentsContain("foo.md", "yarn add foo@2.0.0");
  });

  test("updates whmcs.json version using regex with countMatches", async () => {
    const whmcsPath = path.join(
      fixtureDir,
      "modules/addons/cnicdnsmanager/whmcs.json",
    );
    const replacements = [
      {
        files: [whmcsPath],
        from: '"version": "\\d+\\.\\d+\\.\\d+"',
        to: '"version": "${nextRelease.version}"',
        countMatches: true,
        results: [
          {
            file: whmcsPath,
            hasChanged: true,
            numMatches: 1,
            numReplacements: 1,
          },
        ],
      },
    ];

    await prepare({ replacements }, context);

    await assertFileContentsContain(
      "modules/addons/cnicdnsmanager/whmcs.json",
      '"version": "2.0.0"',
    );
  });
});
