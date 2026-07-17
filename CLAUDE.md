# Project Instructions

## Project Overview

This is a collection of reusable **semantic-release plugins** (`@team-internet/semantic-release-plugins`) maintained by Team Internet / CentralNic Group. It ships a `maven` publisher, a `notify`/`teams-notify` Microsoft Teams notifier, a `notes-override` release-notes replacer, a `replace` file-content updater, and an in-progress `whmcs-build` packaging plugin — each consumable independently via package subpath exports.

## Architecture

- **ESM only** (`"type": "module"`), Node.js `^22.14.0 || >=24.10.0`.
- **Subpath exports:** each plugin is reachable both via the aggregate `src/index.js` (named exports: `maven`, `notesOverride`, `notify`, `replace`) and via its own `package.json#exports` subpath (e.g. `@team-internet/semantic-release-plugins/replace`). `teams-notify` is an alias subpath pointing at the same `notify` implementation. When adding a new plugin, wire both: a named export in `src/index.js` **and** a subpath entry in `package.json#exports`/`files`.
- **Shared core (`src/core/index.js`):**
  - `SemanticReleasePlugin` — base class every plugin extends. Provides the lifecycle skeleton: `resolveConfig()` → `validateConfig()` → `throwIfErrors()` → `afterVerify()`, memoized behind `verifyConditions()` (runs once per plugin instance via the `verified` flag).
  - `ensureVerified(pluginConfig, context, { soft })` — re-runs `verifyConditions`; with `soft: true` it swallows verification failures and logs instead of throwing, for hooks that must not fail the whole release (e.g. a notification).
  - `runOptionalHook(pluginConfig, context, callback, { verifyMessage, hookMessage })` — combines a soft `ensureVerified` with a try/catch around `callback`, so an optional hook (like `notify`'s `success`) degrades to a warning instead of failing the release.
  - `createPluginHooks(pluginInstance, hookNames)` — binds the named methods on a plugin instance and returns them as a hooks object; every plugin's `index.js` calls this once and re-exports the result both as named exports (`export const verifyConditions = hooks.verifyConditions`, …) and as `export default hooks`. Do not hand-bind methods — always go through this helper.
  - Config validators: `validateRequiredConfig(name, code)` and `validateUrlConfig(name, code)` return a validator function `(config) => code | null`; `runConfigValidators(config, validators)` runs them and flattens/filters to an array of error codes.
  - Error codes are resolved through each plugin's `getError` (built with `createSemanticReleaseError(ERROR_DEFINITIONS, code)`), which looks up a same-named function in that plugin's `errors.js` returning `{ message, details }`. Unknown codes fall back to a generic `SemanticReleaseError`.
  - Other utilities: `getContextEnv(context)` (context env with `process.env` fallback), `isDebugEnabled(env, namespace)` (checks `DEBUG=semantic-release:<namespace>` or `semantic-release:*`), `stripMarkdownLinks`, `escapeRegExp`.
- **Per-plugin file layout** (see `notify/`, `notes-override/` as the canonical examples):
  - `index.js` — instantiates the plugin class and calls `createPluginHooks(...)`; the only file semantic-release itself imports.
  - `resolve-config.js` — pure function merging `pluginConfig` with environment variables (**env vars take precedence over plugin config** — keep this precedence when adding options) into a normalized config object.
  - `errors.js` — one exported function per error code, each returning `{ message, details }`.
  - `get-error.js` — one-liner wiring `errors.js` into `createSemanticReleaseError`.
  - Hook-specific logic lives in its own file (e.g. `notify/success.js`, `notify/post-message.js`, `maven/maven.js`, `maven/git.js`) rather than inline in the plugin class.
- **Two class-construction styles in use, both valid:** most plugins (`notify`, `notes-override`) define the `class ... extends SemanticReleasePlugin` directly inside `index.js`. `maven` factors its class into a separate `plugin.js` and `index.js` only imports and wires it — prefer this split once a plugin's class grows non-trivial hooks (maven implements `prepare`, `publish`, and `success` beyond `verifyConditions`).
- **`whmcs-build` (in progress):** currently has `errors.js`, `get-error.js`, `resolve-config.js`, `files.js` but no `index.js`/plugin class yet, and is not wired into `src/index.js` or `package.json#exports`. Follow the established per-plugin layout above when completing it.

## Coding Standards

- Prettier is the only formatter/linter (`pnpm run lint` = `prettier --check .`, `pnpm run lint:fix` = `prettier --write .`) — there is no ESLint config in this repo.
- Prefer small, focused modules over large files; keep plugin classes thin and push logic into sibling files (see Architecture above).
- Use named exports; avoid default exports except for a plugin's aggregate `hooks` object and `index.js` module entry points.
- Config resolution functions are pure and take `(pluginConfig, context)` — do not reach into `process.env` directly outside `resolve-config.js`; always go through `getContextEnv`.

## Testing

- **Framework:** Node's built-in `node:test` + `node:assert/strict` (no Jest/Mocha/Vitest).
- **Test layout mirrors `src/`:** `test/plugins/<plugin>/*.test.js`.
- **Mocking:** use `node:test`'s `mock.fn()` (e.g. mocking `globalThis.fetch`) — restore originals in `afterEach`. No mocking library dependency.
- **Fixtures:** plugins that touch the filesystem (e.g. `replace`) create real temp directories via `mkdtemp`/`tmpdir()` and clean up in `afterEach`/`beforeEach` — don't mock `fs`.
- **Integration tests** are named `*.integration.js` (not `*.test.js`) and are excluded from the default `pnpm test` glob — e.g. `test/plugins/notify/teams-notification.integration.js`, run explicitly via `pnpm run test:teams`. Use this suffix for any test that hits a real external endpoint.

### Running Tests

```bash
pnpm test              # node --test 'test/**/*.test.js'
pnpm run test:coverage # adds --experimental-test-coverage over src/**/*.js
pnpm run test:teams    # runs the Teams webhook integration test explicitly
pnpm run lint          # prettier --check .
pnpm run lint:fix      # prettier --write .
pnpm run build         # node --check on every src/test *.js file (syntax check, not a bundler)
pnpm run ci            # build + test:coverage + lint — what CI runs
```

## Git Conventions

- **Commit messages:** Conventional Commits, `<type>(<scope>): <summary>`. Scope is common but not strictly mandatory (some historical commits omit it, e.g. `ci: use package manager pnpm version`) — prefer including a scope for anything touching a specific plugin or area.
- **Releasing types:** only `fix` and `feat` bump the version (see `.releaserc.json` — `commit-analyzer` + `release-notes-generator` + `@semantic-release/npm`, `branches: ["main"]`). Use `chore`, `ci`, `docs`, `test`, `refactor`, `build` for everything else.
- **Do not add `Co-Authored-By:` trailers** to commit messages in this repo.
- **Default branch:** `main`.
- **Pre-commit hook** (`.githooks/pre-commit`, installed via `pnpm run hooks:install` → `git config core.hooksPath .githooks`, run automatically by the `prepare` script): runs `prettier --write` over staged `*.js`/`*.json`/`*.md`/`*.yml`/`*.yaml`, re-stages them, then runs `pnpm run lint`.

## CI / GitHub Actions

Workflows in `.github/workflows/` are thin wrappers delegating to shared reusable workflows in `centralnicgroup-opensource/rtldev-middleware-shareable-workflows` (pinned `@main`), same pattern as the other `rtldev-middleware-*` repos:

- `test.yml` → `semantic-release-plugins-test.yml` — runs on PR open/sync and via `workflow_call`; also what Dependabot PRs trigger.
- `release.yml` → `semantic-release-plugins-release.yml` — runs on push to `main`.
- `daily-node-dependency-refresh.yml` → shared `daily-node-dependency-refresh.yml`, cron `17 3 * * *`, `base-ref: main`; needs `contents: write` + `pull-requests: write` to open its refresh PR.

Because of this delegation, the test matrix, coverage handling, and Dependabot auto-merge logic live in the shared repo, not here — don't try to reimplement them locally.

## Dependency Lockfile Policy

- **`pnpm-lock.yaml` is committed** — the project uses pnpm (`packageManager: pnpm@10.24.0`), enforced via Corepack in CI. There is no `package-lock.json`.
- `.npmrc` sets `engine-strict=true` — installs fail outright on a Node version outside the `engines` range rather than warning.

## Important Files

| Path                            | Purpose                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `src/core/index.js`             | `SemanticReleasePlugin` base class, `createPluginHooks`, validators, env/debug helpers |
| `src/index.js`                  | Aggregate named exports for all plugins                                                |
| `src/plugins/<name>/index.js`   | Per-plugin semantic-release hook entry point                                           |
| `.releaserc.json`               | semantic-release config for this package's own releases                                |
| `.githooks/pre-commit`          | Formats staged files and runs lint before every commit                                 |
| `.github/workflows/test.yml`    | Delegates to shared `semantic-release-plugins-test.yml`                                |
| `.github/workflows/release.yml` | Delegates to shared `semantic-release-plugins-release.yml`                             |
| `.env.example`                  | Template for local env vars (copy to `.env`, git-ignored)                              |

## Atlassian / JIRA

- **Cloud ID:** `4e50e119-d5ea-4f89-afb1-d4cd47e40177`
- **Default project:** `RSRMID` (3rd-party Software Integrations / Middleware)
- **Work Category field:** `customfield_12383` (required, type: select)
  - `13284` = Strategic
  - `13285` = Maintain Revenue /BAU
  - `13286` = Tech Debt
  - `13287` = Security
- **Business Unit field:** `customfield_10027` (required, type: multi-checkbox)
  - `10187` = CentralNic Reseller (default)
- **Issue types:** Task (`10002`), Bug (`10004`), Story (`10001`), Epic (`10000`)
- **Workflow transitions:** To Do (`11`), In Progress (`21`), In Review (`41`), QA (`61`), Ready for Deployment (`51`), Done (`31`), Stand-by (`71`), Cancelled (`91`)
- **Closing an issue (mandatory time tracking):** an issue will not stay in **Done** without a worklog — Jira automation stamps a `missing-time-spent` label on issues with no time logged and auto-reopens them. Correct sequence: (1) add a worklog (`timeSpent`); (2) remove the `missing-time-spent` label; (3) transition to Done (`31`). When the time amount isn't obvious, ask rather than guessing.
- **Known account IDs:** Kai Schwarz `61358848ee2fd0006aac7b4f`, Asif Nawaz `62a84362bf7afc006f3b15e5`
- **Issue descriptions:** always use ADF (Atlassian Document Format, JSON) — never markdown. Markdown renders literal `\n` characters instead of line breaks.
- **Branch naming:** prefix with the Jira issue ID — e.g. `RSRMID-2821/short-description`
- **Pull requests:** always include the Jira issue link in the PR description. After opening the PR, add the PR URL as a comment on the Jira issue.

## Do NOT

- Add an ESLint config — Prettier is the sole formatting/lint gate for this repo
- Use a mocking library (Sinon, Jest mocks) — use `node:test`'s built-in `mock`
- Bypass `getContextEnv`/`resolve-config.js` env-var precedence by reading `process.env` directly inside plugin logic
- Add `Co-Authored-By:` trailers to commit messages
- Wire a new plugin into only one of `src/index.js` / `package.json#exports` — always update both together
