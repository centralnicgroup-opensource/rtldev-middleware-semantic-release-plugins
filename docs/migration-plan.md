# Migration Plan

## Phase 1

- Create one canonical package with plugin subpath exports.
- Import lightweight semantic-release plugins as separate subpaths.
- Add shared internal helper module for repeated plugin utilities.
- Keep `semantic-release-whmcs` outside the first migration.

## Phase 2

- Move package publishing from the old repositories to this package.
- Release `rtldev-middleware-semantic-release-plugins` as the only npm artifact.
- Update consuming repositories to use the new package subpaths.
- Deprecate/archive old plugin repositories after consumers are migrated.

## Initial Package Map

| Old repository                                      | New plugin subpath                                          |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `rtldev-middleware-semantic-release-notes-override` | `rtldev-middleware-semantic-release-plugins/notes-override` |
| `rtldev-middleware-semantic-release-notify-plugin`  | `rtldev-middleware-semantic-release-plugins/notify`         |
| `rtldev-middleware-semantic-release-replace-plugin` | `rtldev-middleware-semantic-release-plugins/replace`        |
| `rtldev-middleware-maven-semantic-release`          | `rtldev-middleware-semantic-release-plugins/maven`          |

## Excluded For Now

`rtldev-middleware-semantic-release-whmcs` remains separate in phase 1 because it has browser automation, WHMCS Marketplace credentials, Chrome setup, and dedicated test workflow requirements.
