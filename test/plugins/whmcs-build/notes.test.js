import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { execa } from "execa";
import {
  generateNotes,
  previewNotes,
  ReleaseNotesRenderer,
  ScopeCatalogue,
  verifyConditions,
} from "../../../src/plugins/whmcs-build/index.js";

const CATALOGUE = [
  {
    scope: "cnic domain search addon",
    label: "CNIC Domain Search Addon",
    audience: "customer",
    aliases: ["cnicdomainsearch"],
  },
  {
    scope: "cnic registrar module",
    label: "CNIC Registrar Module",
    audience: "customer",
    aliases: ["cnr registrar module"],
  },
  {
    scope: "ibs registrar module",
    label: "Internet.bs Registrar Module",
    audience: "customer",
    aliases: ["ibs"],
  },
  { scope: "deps", label: "Dependencies", audience: "internal" },
];

const VOCABULARY = {
  optionalWords: ["cnic", "addon", "module"],
  acronyms: ["cnic", "dns"],
};

const CONTEXT = {
  host: "https://github.com",
  owner: "acme",
  repository: "widgets",
  commit: "commit",
  linkReferences: true,
};

const catalogueOf = (scopes = CATALOGUE) =>
  new ScopeCatalogue({ scopes, ...VOCABULARY });

async function transformOf(options = {}) {
  const renderer = new ReleaseNotesRenderer({
    catalogue: catalogueOf(),
    ...options,
  });
  const { writerOpts } = await renderer.generatorOptions();

  return (commit) => writerOpts.transform(parse(commit), CONTEXT);
}

/** Minimal stand-in for what conventional-commits-parser hands the writer. */
function parse({ type = "fix", scope, subject, body, notes = [], hash }) {
  return {
    type,
    scope,
    subject,
    header: `${type}(${scope}): ${subject}`,
    body,
    notes,
    references: [],
    hash,
    mentions: [],
    merge: null,
    revert: null,
  };
}

describe("whmcs-build release notes", () => {
  describe("scope resolution", () => {
    const catalogue = catalogueOf();

    test("resolves canonical scopes, aliases and optional-word variants", () => {
      for (const scope of [
        "cnic domain search addon",
        "cnicdomainsearch",
        "domain search",
        "CNIC-Domain-Search",
        "domain search addon",
      ]) {
        assert.equal(
          catalogue.resolve(scope).label,
          "CNIC Domain Search Addon",
          scope,
        );
      }
    });

    test("falls back to acronym-aware title case and records the scope", () => {
      const resolved = catalogue.resolve("dns fallback");

      assert.deepEqual(resolved, {
        label: "DNS Fallback",
        audience: "customer",
        known: false,
      });
      assert.ok(catalogue.unknown.has("dns fallback"));
    });

    test("does not resolve one product to another by prefix", () => {
      assert.equal(catalogue.isKnown("cnic domain"), false);
    });
  });

  describe("catalogue checks", () => {
    test("reports two entries claiming the same key", () => {
      const { errors } = catalogueOf([
        { scope: "one", label: "One", aliases: ["shared"] },
        { scope: "two", label: "Two", aliases: ["shared"] },
      ]).check();

      assert.equal(errors.length, 1);
      assert.match(errors[0], /"shared" is claimed by both "one" and "two"/);
    });

    test("claims a family of directories with one glob", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "catalogue-"));
      await mkdir(path.join(root, "modules/registrars/cnic1"), {
        recursive: true,
      });
      await mkdir(path.join(root, "modules/registrars/cnic2"), {
        recursive: true,
      });

      const { errors } = catalogueOf([
        {
          scope: "cnic registrar module",
          label: "CNIC Registrar Module",
          paths: ["modules/registrars/cnic*"],
        },
      ]).check({ cwd: root, coverGlob: "modules/*/*" });

      await rm(root, { recursive: true, force: true });
      assert.deepEqual(errors, []);
    });

    test("reports a module no entry claims", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "catalogue-"));
      await mkdir(path.join(root, "modules/addons/cnicorphan"), {
        recursive: true,
      });

      const { errors } = catalogueOf([]).check({
        cwd: root,
        coverGlob: "modules/*/*",
      });

      await rm(root, { recursive: true, force: true });
      assert.match(errors[0], /cnicorphan has no entry/);
    });

    test("reports an entry with an unusable audience", () => {
      const { errors } = catalogueOf([
        { scope: "one", label: "One", audience: "everyone" },
      ]).check();

      assert.match(errors[0], /expected customer or internal/);
    });
  });

  describe("commit rendering", () => {
    test("prints the product label and nests the body under its bullet", async () => {
      const transform = await transformOf();
      const rendered = transform({
        scope: "cnr registrar module",
        subject: "retry transfer polling",
        body: "* first detail\n* second detail",
        hash: "abc1234def",
      });

      assert.equal(rendered.scope, "CNIC Registrar Module");
      assert.equal(
        rendered.bodyMarkdown,
        "\n  * first detail\n  * second detail",
      );
      assert.equal(
        rendered.commitLink,
        " ([abc1234](https://github.com/acme/widgets/commit/abc1234def))",
      );
    });

    test("separates a prose body from the subject line", async () => {
      const transform = await transformOf();
      const { bodyMarkdown } = transform({
        scope: "deps",
        subject: "bump the sdk",
        body: "Adds retry support.",
      });

      assert.equal(bodyMarkdown, "\n\n  Adds retry support.");
    });

    test("renames the raw chore type and ranks internal work last", async () => {
      const transform = await transformOf();
      const chore = transform({
        type: "chore",
        scope: "deps",
        subject: "refresh dependencies",
        notes: [{ title: "BREAKING CHANGE", text: "re-import zones" }],
      });

      assert.equal(chore.type, "Maintenance");
      assert.equal(chore.audienceRank, 1);
    });

    test("titles an UPGRADE NOTES trailer as a section", async () => {
      const transform = await transformOf();
      const { notes } = transform({
        scope: "domain search",
        subject: "add premium badges",
        notes: [{ title: "UPGRADE NOTES", text: "run the importer once" }],
      });

      assert.equal(notes[0].title, "Upgrade Notes");
    });

    test("customer notes drop internal commits and their commit links", async () => {
      const transform = await transformOf({ audience: "customer" });

      assert.equal(
        transform({ scope: "deps", subject: "bump the sdk", hash: "abc1234" }),
        null,
      );
      assert.equal(
        transform({
          scope: "domain search",
          subject: "add premium badges",
          hash: "abc1234",
        }).commitLink,
        "",
      );
    });
  });

  describe("plugin", () => {
    let cwd;

    beforeEach(async () => {
      cwd = await mkdtemp(path.join(tmpdir(), "release-notes-"));
      await writeFile(
        path.join(cwd, "scopes.json"),
        JSON.stringify({ ...VOCABULARY, scopes: CATALOGUE }),
      );
    });

    afterEach(async () => {
      await rm(cwd, { recursive: true, force: true });
    });

    test("rejects release notes configured without a catalogue", async () => {
      await assert.rejects(
        () =>
          verifyConditions(
            { archiveFileName: "bundle", releaseNotes: {} },
            { cwd, env: {}, logger: { log() {} } },
          ),
        (error) =>
          error instanceof AggregateError &&
          error.errors.some(({ code }) => code === "ScopeCatalogueNotFound"),
      );
    });

    test("previews the notes for the commits since a tag", async () => {
      const git = (args) => execa("git", args, { cwd });
      await git(["init", "--initial-branch=main"]);
      await git(["config", "user.email", "test@example.com"]);
      await git(["config", "user.name", "Test"]);
      await git(["commit", "--allow-empty", "-m", "chore: initial"]);
      await git(["tag", "v1.0.0"]);
      await git([
        "commit",
        "--allow-empty",
        "-m",
        "fix(domain search): show premium badges",
      ]);

      const notes = await previewNotes(
        {
          archiveFileName: "bundle",
          releaseNotes: { scopesFile: "scopes.json" },
        },
        {
          cwd,
          repositoryUrl: "https://github.com/acme/widgets",
          tagPattern: "v*",
        },
      );

      assert.match(
        notes,
        /\*\*CNIC Domain Search Addon:\*\* show premium badges/,
      );
    });

    test("renders notes with product names, sections first and excluded scopes dropped", async () => {
      const notes = await generateNotes(
        {
          archiveFileName: "bundle",
          releaseNotes: {
            scopesFile: "scopes.json",
            excludeScopes: ["ibs registrar module"],
          },
        },
        {
          cwd,
          env: {},
          logger: { log() {} },
          options: { repositoryUrl: "https://github.com/acme/widgets" },
          lastRelease: { gitTag: "v1.0.0" },
          nextRelease: { version: "1.1.0", gitTag: "v1.1.0" },
          commits: [
            {
              hash: "1111111111111111111111111111111111111111",
              message:
                "fix(domain search): show premium badges\n\n* badge next to premium results\n\nUPGRADE NOTES: run the pricing importer once.",
            },
            {
              hash: "2222222222222222222222222222222222222222",
              message: "fix(ibs): something only Internet.bs cares about",
            },
          ],
        },
      );

      assert.match(notes, /### Upgrade Notes[\s\S]*### Bug Fixes/);
      assert.match(
        notes,
        /\*\*CNIC Domain Search Addon:\*\* show premium badges/,
      );
      assert.match(notes, /\n {2}\* badge next to premium results/);
      assert.doesNotMatch(notes, /Internet\.bs/);
    });
  });
});
