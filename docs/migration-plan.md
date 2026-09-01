# Migration Plan

## Phase 1

- Create one canonical package with plugin subpath exports.
- Import lightweight semantic-release plugins as separate subpaths.
- Add shared internal helper module for repeated plugin utilities.
- Keep `semantic-release-whmcs` outside the first migration.

## Phase 2

- Move package publishing from the old repositories to this package.
- Release `@team-internet/semantic-release-plugins` as the only npm artifact.
- Update consuming repositories to use the new package subpaths.
- Deprecate/archive old plugin repositories after consumers are migrated.

## Initial Package Map

| Old repository                                      | New plugin subpath                                          |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `rtldev-middleware-semantic-release-notes-override` | `@team-internet/semantic-release-plugins/notes-override`    |
| `rtldev-middleware-semantic-release-notify-plugin`  | `@team-internet/semantic-release-plugins/notify`            |
| `rtldev-middleware-semantic-release-replace-plugin` | `@team-internet/semantic-release-plugins/replace`           |
| `rtldev-middleware-maven-semantic-release`          | `@team-internet/semantic-release-plugins/maven`             |
| `rtldev-middleware-semantic-release-whmcs`          | `@team-internet/semantic-release-plugins/whmcs-marketplace` |

## Phase 3 (RSRMID-3031)

`rtldev-middleware-semantic-release-whmcs` was excluded from phase 1 because of its browser
automation, WHMCS Marketplace credentials, Chrome setup, and dedicated test workflow. It is
now migrated as `@team-internet/semantic-release-plugins/whmcs-marketplace`, with those
concerns resolved rather than carried over:

- `puppeteer` is an optional peer dependency, dynamically imported, so no other subpath's
  consumers pull it or a Chrome download.
- Chrome provisioning moved out of the plugin: no more `sudo pnpm dlx puppeteer browsers
  install chrome --install-deps` from a `prepare` hook. The release job installs the browser,
  and `verifyConditions` fails early when it is missing.
- The credential-backed marketplace round trip is an `*.integration.js` test behind
  `pnpm run test:whmcs`, so the default suite needs neither credentials nor a browser.
- `debug`, `aggregate-error`, `@octokit/rest` and `yargs` are gone, replaced by the shared
  core, `fetch`, and named exports the consuming project's own CLI can call.

Retiring the standalone repository, once `rtldev-middleware-whmcs-src` has released through
the new subpath:

- `npm deprecate @hexonet/semantic-release-whmcs` pointing at the new subpath.
- Archive `rtldev-middleware-semantic-release-whmcs` on GitHub.
- Remove `semantic-release-whmcs-{test,release}.yml` from
  `rtldev-middleware-shareable-workflows`.
