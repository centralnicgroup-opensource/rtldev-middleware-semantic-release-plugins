import {
  commitPartial,
  mainTemplate,
  renderBody,
  renderCommitLink,
} from "./templates.js";

/**
 * Note titles that mean "breaking". Everything else keeps the trailer's own
 * wording. The preset cannot be trusted with this: Angular v8 maps *every* note
 * title to BREAKING CHANGES, so an UPGRADE NOTES trailer would be filed as a
 * breaking change on one preset version and not on another.
 */
const BREAKING_TITLES = new Set([
  "BREAKING CHANGE",
  "BREAKING-CHANGE",
  "BREAKING CHANGES",
]);

/** Section titles the Angular preset leaves as the raw commit type. */
const TYPE_TITLES = { chore: "Maintenance" };

/** Customer-facing work sorts above build and tooling work. */
const AUDIENCE_RANK = { customer: 0, internal: 1 };

/**
 * Turns parsed commits into the parser and writer options
 * @semantic-release/release-notes-generator expects. Both extend the preset per
 * property, so anything not set here keeps the preset's behaviour.
 */
export class ReleaseNotesRenderer {
  /**
   * Trailers that open their own section. BREAKING CHANGE keeps the Angular
   * behaviour - a commit of any type carrying it is a major release, decided by
   * commit-analyzer. UPGRADE NOTES says a version needs a manual step even
   * though nothing broke; it is deliberately not configured on commit-analyzer,
   * so it can never change the release type.
   */
  static noteKeywords = ["BREAKING CHANGE", "BREAKING-CHANGE", "UPGRADE NOTES"];

  /**
   * @param {object} options
   * @param {import("./scope-catalogue.js").ScopeCatalogue} options.catalogue
   * @param {string} [options.audience] "customer" drops internal-audience
   *   commits and omits commit links, for a copy republished elsewhere.
   * @param {(commit: object, resolved: object) => boolean} [options.include]
   * @param {(message: string) => void} [options.warn]
   */
  constructor({ catalogue, audience = "all", include = () => true, warn }) {
    this.catalogue = catalogue;
    this.audience = audience;
    this.include = include;
    this.warn = warn || (() => {});
  }

  /** The Angular-style preset transform this renderer builds on. */
  static async loadPresetTransform(preset) {
    const module = await import(`conventional-changelog-${preset}`);
    const factory = module.default || module;
    return (await factory()).writer.transform;
  }

  static titleForNote(rawTitle, catalogue) {
    const upper = String(rawTitle || "").toUpperCase();
    // titleCase, not resolve: a trailer title is not a scope, and resolving it
    // would file it as an unknown scope.
    return BREAKING_TITLES.has(upper)
      ? "BREAKING CHANGES"
      : catalogue.titleCase(upper);
  }

  /** Cluster per product, and sink build and tooling work to the bottom. */
  static compareCommits(a, b) {
    return (
      a.audienceRank - b.audienceRank ||
      String(a.scope).localeCompare(String(b.scope)) ||
      String(a.subject).localeCompare(String(b.subject))
    );
  }

  transform(commit, context, presetTransform) {
    const transformed = presetTransform(commit, context);

    if (!transformed) {
      return null;
    }

    const resolved = this.catalogue.resolve(transformed.scope);

    if (this.audience === "customer" && resolved.audience === "internal") {
      return null;
    }

    if (!this.include(commit, resolved)) {
      return null;
    }

    return {
      ...transformed,
      scope: resolved.label,
      type: TYPE_TITLES[transformed.type] || transformed.type,
      audienceRank: AUDIENCE_RANK[resolved.audience] ?? 0,
      // Titles are restored from the parsed commit by position: the preset has
      // already rewritten them by the time they get here.
      notes: transformed.notes.map((note, position) => ({
        ...note,
        title: ReleaseNotesRenderer.titleForNote(
          commit.notes?.[position]?.title ?? note.title,
          this.catalogue,
        ),
      })),
      // A customer-facing copy is republished elsewhere with internal links
      // stripped; leaving the link out avoids the empty parentheses that
      // stripping leaves behind.
      commitLink:
        this.audience === "customer"
          ? ""
          : renderCommitLink(commit.hash, transformed.shortHash, context),
      bodyMarkdown: renderBody(commit.body),
    };
  }

  /** Options for @semantic-release/release-notes-generator. */
  async generatorOptions(preset = "angular") {
    const presetTransform =
      await ReleaseNotesRenderer.loadPresetTransform(preset);

    return {
      preset,
      parserOpts: { noteKeywords: ReleaseNotesRenderer.noteKeywords },
      writerOpts: {
        mainTemplate,
        commitPartial,
        commitsSort: ReleaseNotesRenderer.compareCommits,
        finalizeContext: (context) => {
          if (this.catalogue.unknown.size > 0) {
            this.warn(
              `Commit scopes missing from the scope catalogue: ${[
                ...this.catalogue.unknown,
              ]
                .map((scope) => `"${scope}"`)
                .join(", ")}`,
            );
          }

          return context;
        },
        transform: (commit, context) =>
          this.transform(commit, context, presetTransform),
      },
    };
  }
}
