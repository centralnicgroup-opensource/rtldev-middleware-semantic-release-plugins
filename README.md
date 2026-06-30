# @team-internet/semantic-release-plugins

[![npm version](https://img.shields.io/npm/v/@team-internet/semantic-release-plugins.svg)](https://www.npmjs.com/package/@team-internet/semantic-release-plugins)
[![npm downloads](https://img.shields.io/npm/dm/@team-internet/semantic-release-plugins.svg)](https://www.npmjs.com/package/@team-internet/semantic-release-plugins)
[![license](https://img.shields.io/npm/l/@team-internet/semantic-release-plugins.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@team-internet/semantic-release-plugins.svg)](package.json)

A collection of reusable [semantic-release](https://github.com/semantic-release/semantic-release) plugins for common release pipeline tasks: updating files with the next version, sending Microsoft Teams notifications, overriding release notes, and publishing Maven projects.

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Available Plugins](#available-plugins)
- [Quick Start](#quick-start)
- [Plugin Reference](#plugin-reference)
  - [replace](#replace)
  - [notify / teams-notify](#notify--teams-notify)
  - [notes-override](#notes-override)
  - [maven](#maven)
- [Debugging](#debugging)

---

## Requirements

- Node.js `^22.14.0 || >=24.10.0`
- semantic-release `25` or compatible

---

## Installation

```sh
# pnpm
pnpm add -D @team-internet/semantic-release-plugins

# npm
npm install --save-dev @team-internet/semantic-release-plugins

# yarn
yarn add --dev @team-internet/semantic-release-plugins
```

---

## Available Plugins

| Plugin           | Subpath                                                  | Lifecycle hooks                                     |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `replace`        | `@team-internet/semantic-release-plugins/replace`        | `prepare`                                           |
| `notify`         | `@team-internet/semantic-release-plugins/notify`         | `verifyConditions`, `success`                       |
| `teams-notify`   | `@team-internet/semantic-release-plugins/teams-notify`   | `verifyConditions`, `success`                       |
| `notes-override` | `@team-internet/semantic-release-plugins/notes-override` | `verifyConditions`, `generateNotes`                 |
| `maven`          | `@team-internet/semantic-release-plugins/maven`          | `verifyConditions`, `prepare`, `publish`, `success` |

`teams-notify` is an alias for `notify`.

---

## Quick Start

Add any plugin subpath to your semantic-release configuration:

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@team-internet/semantic-release-plugins/replace",
      {
        "replacements": [
          {
            "files": ["src/version.js"],
            "from": "__VERSION__ = \\\".*\\\"",
            "to": "__VERSION__ = \\\"${nextRelease.version}\\\""
          }
        ]
      }
    ],
    [
      "@team-internet/semantic-release-plugins/notify",
      {
        "teamsWebhook": "https://example.webhook.office.com/...",
        "packageName": "my-service"
      }
    ],
    "@semantic-release/github"
  ]
}
```

---

## Plugin Reference

### `replace`

Updates file contents during the `prepare` phase. Supports semantic-release context interpolation in replacement strings (e.g. `${nextRelease.version}`, `${nextRelease.channel}`).

```json
[
  "@team-internet/semantic-release-plugins/replace",
  {
    "replacements": [
      {
        "files": ["package.json"],
        "from": "\\\"version\\\": \\\".*\\\"",
        "to": "\\\"version\\\": \\\"${nextRelease.version}\\\""
      }
    ]
  }
]
```

Each object in `replacements` is passed to [`replace-in-file`](https://github.com/adamreisnz/replace-in-file). Key behaviours:

- **`from`** — string values are compiled to global, multiline regular expressions.
- **`to`** — accepts a string, array, or callback. Supports `${...}` interpolation from semantic-release context.
- **`results`** — optional assertion object. The release fails if the actual replacement results do not match the expected `files`, `hasChanged`, or replacement counts. Useful for catching accidental no-ops.

**Multiple replacements example:**

```json
[
  "@team-internet/semantic-release-plugins/replace",
  {
    "replacements": [
      {
        "files": ["src/version.js"],
        "from": "const VERSION = \\\".*\\\";",
        "to": "const VERSION = \\\"${nextRelease.version}\\\";"
      },
      {
        "files": ["Chart.yaml"],
        "from": "appVersion: .*",
        "to": "appVersion: ${nextRelease.version}"
      }
    ]
  }
]
```

---

### `notify` / `teams-notify`

Sends a Microsoft Teams notification after a successful release. Both plugin names resolve to the same implementation — use whichever is clearer in your configuration.

```json
[
  "@team-internet/semantic-release-plugins/notify",
  {
    "teamsWebhook": "https://example.webhook.office.com/...",
    "packageName": "my-service"
  }
]
```

All options can be supplied as plugin config or resolved automatically from environment variables. Environment variables take precedence over plugin config.

| Option             | Environment variable                                                | Required                                           |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| `teamsWebhook`     | `TEAMS_NOTIFICATION_URI`                                            | Yes                                                |
| `githubToken`      | `GH_TOKEN`, `GITHUB_TOKEN`                                          | Yes                                                |
| `packageName`      | `SEMANTIC_RELEASE_PACKAGE`, `npm_package_name`, `package.json#name` | Yes (auto-resolved from `package.json` if not set) |
| `commitSHA`        | `COMMIT_SHA`                                                        | No                                                 |
| `notificationType` | `TEAMS_NOTIFICATION_TYPE`                                           | No                                                 |

The Teams webhook must be created from the Microsoft Teams **Workflows** app using the "Send webhook alerts to a channel" template or equivalent. The notification payload uses the Adaptive Card format supported by Workflows webhooks.

---

### `notes-override`

Replaces the release notes generated by semantic-release with a fixed string. Useful when notes are produced externally — for example, from a Jira sprint query or a changelog file written by the pipeline before release.

```json
[
  "@team-internet/semantic-release-plugins/notes-override",
  {
    "notes": "See JIRA-1234 for full changelog."
  }
]
```

The `notes` value can also be supplied via the `customReleaseNotes` environment variable, which takes precedence over the plugin config. Markdown links are stripped from the output before it is returned to semantic-release.

---

### `maven`

Releases Maven projects from a semantic-release pipeline. The plugin:

1. Verifies that `mvn` (or `./mvnw`) is available.
2. Updates all `pom.xml` files to the release version.
3. Runs the configured Maven publish target.
4. Optionally commits the next `-SNAPSHOT` version after a successful publish.

```json
[
  "@team-internet/semantic-release-plugins/maven",
  {
    "mvnw": true,
    "settingsPath": "./settings.xml",
    "mavenTarget": "deploy",
    "processAllModules": true,
    "updateSnapshotVersion": true
  }
]
```

| Option                  | Default                                          | Description                                                                                                |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `mvnw`                  | `false`                                          | Use `./mvnw` wrapper instead of the system `mvn` binary.                                                   |
| `settingsPath`          | unset                                            | Path to a Maven settings file, passed as `--settings`. Allowed characters: word chars, `~`, `.`, `/`, `-`. |
| `mavenTarget`           | `deploy`                                         | Maven goal(s) to run. One of `deploy`, `package jib:build`, or `deploy jib:build`.                         |
| `clean`                 | `true`                                           | Prepend `clean` to the publish command.                                                                    |
| `processAllModules`     | `false`                                          | Pass `-DprocessAllModules` when updating `pom.xml` versions in multi-module builds.                        |
| `updateSnapshotVersion` | `false`                                          | After a successful release, update `pom.xml` to the next `-SNAPSHOT` version and commit.                   |
| `snapshotCommitMessage` | `chore: setting next snapshot version [skip ci]` | Commit message used for the snapshot version bump.                                                         |
| `opts`                  | `""`                                             | Additional Maven arguments appended to the publish command, split on spaces.                               |
| `debug`                 | `false`                                          | Add Maven `-X` for verbose build output.                                                                   |

**Minimal example — deploy with Maven wrapper:**

```json
[
  "@team-internet/semantic-release-plugins/maven",
  {
    "mvnw": true
  }
]
```

**Multi-module project with Jib and snapshot update:**

```json
[
  "@team-internet/semantic-release-plugins/maven",
  {
    "mvnw": true,
    "mavenTarget": "deploy jib:build",
    "processAllModules": true,
    "updateSnapshotVersion": true,
    "snapshotCommitMessage": "chore(release): set next snapshot version [skip ci]"
  }
]
```

---

## Debugging

Set the `DEBUG` environment variable to the plugin namespace to enable verbose logging:

```sh
DEBUG=semantic-release:notify pnpm semantic-release
DEBUG=semantic-release:teams-notify pnpm semantic-release
DEBUG=semantic-release:notes-override pnpm semantic-release
```

Use `DEBUG=semantic-release:*` to enable all plugins simultaneously.

For Maven build output, set `"debug": true` in the plugin options to pass `-X` to Maven.

---

## License

[MIT](LICENSE) — Team Internet Group PLC
