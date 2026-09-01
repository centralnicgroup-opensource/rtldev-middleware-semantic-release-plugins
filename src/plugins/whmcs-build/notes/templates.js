// Handlebars templates for the release notes, plus the helpers that precompute
// what a template cannot express.
//
// These must stay template *strings*: conventional-changelog-writer@8, which
// @semantic-release/release-notes-generator pulls in, registers partials through
// Handlebars, while the Angular preset's own partials became render functions in
// v9 and render an empty commit list when passed here.

/**
 * One commit: product label, subject, commit link, then the body indented into
 * a sub-list. Appending the body to the subject instead - the obvious shortcut -
 * renders it as sibling bullets with no product attached to them.
 */
export const commitPartial =
  "*{{#if scope}} **{{scope}}:**{{/if}} " +
  "{{#if subject}}{{subject}}{{else}}{{header}}{{/if}}" +
  "{{commitLink}}{{bodyMarkdown}}\n";

/**
 * The Angular main template with one change: {{> footer}} - the BREAKING CHANGES
 * and Upgrade Notes sections - renders before the commit lists. Whoever has to
 * act by hand should not have to scroll past every bug fix to learn that.
 */
export const mainTemplate = `{{> header}}
{{> footer}}
{{#each commitGroups}}

{{#if title}}
### {{title}}

{{/if}}
{{#each commits}}
{{> commit root=@root}}
{{/each}}

{{/each}}
`;

/** Indents a commit body so it renders as a sub-list of its own bullet. */
export function renderBody(body) {
  const trimmed = body?.trim();
  if (!trimmed) {
    return "";
  }

  const indented = trimmed
    .split("\n")
    .map((line) => (line.trim() ? `  ${line.trimEnd()}` : ""))
    .join("\n");

  // A body that does not start as a list would otherwise be swallowed as a lazy
  // continuation of the subject line.
  return `${/^\s*[*-]\s+/.test(trimmed) ? "\n" : "\n\n"}${indented}`;
}

/** ` ([abc1234](…/commit/abc1234…))`, or a bare hash when links are disabled. */
export function renderCommitLink(hash, shortHash, context = {}) {
  if (!hash || !shortHash) {
    return "";
  }

  const base =
    context.host && context.owner && context.repository
      ? `${context.host}/${context.owner}/${context.repository}`
      : context.repoUrl;

  return context.linkReferences === false || !base
    ? ` ${shortHash}`
    : ` ([${shortHash}](${base}/${context.commit || "commit"}/${hash}))`;
}
