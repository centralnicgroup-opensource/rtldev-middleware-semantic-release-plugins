# RSRMID Tech Debt: Consolidate semantic-release plugins into one package

## Summary

Create `rtldev-middleware-semantic-release-plugins` as a CentralNic open-source package for the internally maintained semantic-release plugins.

## Work Category

Tech Debt

## Assignee

Asif Nawaz

## Background

Several semantic-release plugins are maintained in separate repositories even though they share the same dependency maintenance, CI, release notification, error handling, and configuration patterns. The current split creates duplicated workflow upkeep and inconsistent dependency refresh behavior.

## Scope

- Create one publishable npm package: `@team-internet/semantic-release-plugins`.
- Import these plugins as independently invokable subpaths:
  - `@team-internet/semantic-release-plugins/notes-override`
  - `@team-internet/semantic-release-plugins/notify`
  - `@team-internet/semantic-release-plugins/replace`
  - `@team-internet/semantic-release-plugins/maven`
- Add a small internal shared core module for common helpers.
- Keep each plugin separately invokable from semantic-release configs.
- Align GitHub workflows, Dependabot, and daily dependency refresh behavior.
- Exclude `semantic-release-whmcs` from the first migration because it has dedicated WHMCS/Puppeteer/browser automation concerns.

## Acceptance Criteria

- New repository folder exists as `rtldev-middleware-semantic-release-plugins`.
- Root `package.json` exposes plugin subpaths for Maven, notify, notes override, and replace.
- Initial plugin implementations are present under `src/plugins/*`.
- Shared helper module exists for common semantic-release plugin utilities.
- The package can be published as a single npm artifact and used to deprecate the old plugin repositories.
- Initial CI command is documented and can be run with `pnpm run ci`.
