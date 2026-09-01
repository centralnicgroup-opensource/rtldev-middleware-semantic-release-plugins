import { ReleaseNotesRenderer } from "./renderer.js";
import { ScopeCatalogue } from "./scope-catalogue.js";

/**
 * Commits of another product released from the same history are dropped here.
 * Both the scope as written and the entry it resolves to are matched, so a
 * filter can name the canonical scope and still catch its aliases.
 */
export function createCommitFilter({ includeScopes, excludeScopes }) {
  const normalize = (list) => list?.map(ScopeCatalogue.normalize);
  const include = normalize(includeScopes);
  const exclude = normalize(excludeScopes);

  if (!include && !exclude) {
    return () => true;
  }

  return (commit, resolved) => {
    const keys = [commit.scope, resolved.scope]
      .filter(Boolean)
      .map(ScopeCatalogue.normalize);
    const matches = (list) => keys.some((key) => list.includes(key));

    if (exclude && matches(exclude)) {
      return false;
    }

    return include ? matches(include) : true;
  };
}

/**
 * Renders the notes for a release from its commits: product names instead of
 * raw commit scopes, commit bodies nested under their own bullet, and BREAKING
 * CHANGES and Upgrade Notes above the lists.
 *
 * Used twice per release - once for the notes of the release itself, and once
 * more with `audience: "customer"` for the copy a distribution repository
 * publishes, which leaves out internal work and commit links.
 *
 * @param {object} releaseNotes Normalized `releaseNotes` config.
 * @param {object} context semantic-release context (needs `commits`).
 * @param {object} [overrides]
 * @param {string} [overrides.audience]
 */
export async function renderReleaseNotes(
  releaseNotes,
  context,
  overrides = {},
) {
  const renderer = new ReleaseNotesRenderer({
    catalogue: releaseNotes.catalogue,
    audience: overrides.audience || releaseNotes.audience,
    include: createCommitFilter(releaseNotes),
    warn: (message) => (context.logger || console).log(message),
  });
  const { generateNotes } =
    await import("@semantic-release/release-notes-generator");

  return generateNotes(
    await renderer.generatorOptions(releaseNotes.preset),
    context,
  );
}

/** Catalogue problems, as whmcs-build error codes. */
export function validateReleaseNotes({
  unreadable,
  catalogue,
  cwd,
  coverGlob,
}) {
  if (unreadable) {
    return ["ScopeCatalogueUnreadable"];
  }

  if (!catalogue) {
    return ["ScopeCatalogueNotFound"];
  }

  return catalogue.check({ cwd, coverGlob }).errors.length > 0
    ? ["ScopeCatalogueInvalid"]
    : [];
}
