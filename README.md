# @team-internet/semantic-release-plugins

[![npm version](https://img.shields.io/npm/v/@team-internet/semantic-release-plugins.svg)](https://www.npmjs.com/package/@team-internet/semantic-release-plugins)
[![npm downloads](https://img.shields.io/npm/dm/@team-internet/semantic-release-plugins.svg)](https://www.npmjs.com/package/@team-internet/semantic-release-plugins)
[![license](https://img.shields.io/npm/l/@team-internet/semantic-release-plugins.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@team-internet/semantic-release-plugins.svg)](package.json)

A collection of reusable [semantic-release](https://github.com/semantic-release/semantic-release) plugins for common release pipeline tasks: updating files with the next version, sending Microsoft Teams notifications, overriding release notes, publishing Maven projects, and building/publishing WHMCS module bundles.

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
  - [whmcs-build](#whmcs-build)
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
| `whmcs-build`    | `@team-internet/semantic-release-plugins/whmcs-build`    | `verifyConditions`, `prepare`, `publish`            |

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

### `whmcs-build`

Builds and publishes WHMCS module bundles. Aimed at WHMCS module authors who ship an [IonCube](https://www.ioncube.com/)-encoded release archive to a downstream distribution repository — this consolidates that pipeline into semantic-release lifecycle hooks instead of a standalone task runner:

- **`verifyConditions`** — validates the configuration, checks the IonCube encoder exists (when encryption is enabled), the distribution-repository token is set (when publishing is enabled), and optional dependencies are installed.
- **`prepare`** — stamps the release version onto the module logo (optional), installs production Composer dependencies, cleans and rebuilds the build directory from the configured file globs (stripping `.public` from file names), formats the build output with Prettier, encrypts the configured PHP files with IonCube inside a managed license window, verifies every protected file carries an IonCube header, and zips the build directory into `<archiveFileName><archiveSuffix>.zip` (`-latest` by default).
- **`publish`** — clones or refreshes a downstream distribution repository, copies the configured artifacts (renaming the configured archive suffix when requested), commits and pushes, and optionally runs a nested semantic-release inside that repository. This is useful for shipping a built/encoded bundle from a private source repository into a separate public or internal distribution repository.

```json
[
  "@team-internet/semantic-release-plugins/whmcs-build",
  {
    "archiveFileName": "my-whmcs-module",
    "filesForArchive": [
      "LICENSE",
      "@(README.public|HISTORY).md",
      "@(modules|resources|includes|templates)/**",
      "!modules/registrars/@(tppwregistrar|ibs|moniker)/**"
    ],
    "composer": { "script": "./composer.sh" },
    "logoStamp": {
      "input": "modules/registrars/example/raw_logo.png",
      "output": "modules/registrars/example/logo.png"
    },
    "prettier": { "files": ["build/**/*.@(js|json|css)"] },
    "encrypt": {
      "encoderPath": "/opt/ioncube/ioncube_encoder.sh",
      "commands": [
        "-81 --bundle --add-comments COPYRIGHTS",
        "-82 --add-to-bundle --keep-comments"
      ],
      "files": ["modules/**/*.php", "!modules/**/lang/**/*.php"]
    },
    "distributionRepo": {
      "url": "https://github.com/acme/my-whmcs-module-dist.git",
      "files": ["my-whmcs-module-latest.zip", "build/HISTORY.md"]
    }
  }
]
```

For several archives sharing one semantic-release version, keep the build
profiles in one JSON file and select them from the plugin configuration:

```json
[
  "@team-internet/semantic-release-plugins/whmcs-build",
  {
    "configFile": "release-config.json",
    "profiles": ["ibs", "moniker"]
  }
]
```

The base settings are merged into each named profile. A profile's
`beforeBuild` command runs before that archive is prepared. Generated archives
use the configured `archiveSuffix` (default `-latest`); distribution `files`
entries can rename them when they are published.

| Option                   | Default   | Description                                                                                                                                                         |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configFile`             | unset     | Path (relative to `cwd`) to a JSON file to load these options from. Inline options override the file.                                                               |
| `profiles`               | unset     | Named profiles from `configFile`, built in order under the same semantic-release version.                                                                           |
| `builds`                 | unset     | Array of complete build configurations. Runs each build in order under the same semantic-release version.                                                           |
| `archiveFileName`        | required  | Base name for the release archive (`<archiveFileName><archiveSuffix>.zip`).                                                                                         |
| `archiveSuffix`          | `-latest` | Suffix inserted before `.zip`. Set to an empty string when a product must keep `<archiveFileName>.zip`.                                                             |
| `archiveBuildPath`       | `build`   | Directory the bundle is assembled in.                                                                                                                               |
| `filesForArchive`        | `[]`      | Globs copied into the build directory. `!` prefix negates; `.public` is stripped from file names.                                                                   |
| `filesForArchiveMapping` | `{}`      | Map of source glob → list of destination directories inside the build directory.                                                                                    |
| `composer`               | `false`   | `{ script, module }` — script that prepares production Composer dependencies.                                                                                       |
| `beforeBuild`            | `false`   | `{ command, args }` — optional executable and argument list run immediately before this build. Useful for generating a branded module from another module's source. |
| `logoStamp`              | `false`   | `{ input, output, fontSize, color, padding }` — stamp `v<version>` onto a logo (needs `skia-canvas`).                                                               |
| `prettier`               | `false`   | `{ files }` — format the matched build output (needs `prettier`).                                                                                                   |
| `encrypt`                | `false`   | `{ encoderPath, commands, files, sudo }` — IonCube encryption of the matched files.                                                                                 |
| `archive`                | `true`    | Zip the build directory after all prepare steps.                                                                                                                    |
| `distributionRepo`       | `false`   | `{ url, dir, branch, files, releaserc, tokenEnv, runSemanticRelease, releaseConfigFiles, commitMessage }` — see below.                                              |

**`distributionRepo` fields:**

| Field                | Default                        | Description                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`                | required                       | Git URL of the downstream repository to publish to.                                                                                                                                                                                                                                                            |
| `dir`                | `distribution-repo`            | Local directory the repository is cloned into.                                                                                                                                                                                                                                                                 |
| `branch`             | `main`                         | Branch to check out, commit to, and push.                                                                                                                                                                                                                                                                      |
| `files`              | `[]`                           | Artifacts to copy into the distribution repository. Each entry is a glob string (copied as-is), or a `{ "from": "<glob>", "to": "<path>" }` pair that renames the matched file (e.g. dropping a `-latest` suffix). The `archiveBuildPath` prefix is stripped from every target so files land at the repo root. |
| `releaserc`          | `.releaserc.distribution.json` | semantic-release config copied into the distribution repository while preserving its `.json`, `.js`, `.cjs`, or `.mjs` extension.                                                                                                                                                                              |
| `tokenEnv`           | `DISTRIBUTION_REPO_TOKEN`      | Environment variable holding a GitHub token with push access to the distribution repository.                                                                                                                                                                                                                   |
| `runSemanticRelease` | `true`                         | Run a nested semantic-release inside the distribution repository after pushing.                                                                                                                                                                                                                                |
| `releaseTarget`      | `false`                        | Optional `RELEASE_TARGET` value passed to the downstream semantic-release process when one config contains multiple independent release streams.                                                                                                                                                               |
| `commitScope`        | `release`                      | Conventional Commit scope used for the generated distribution commit. Give each independently versioned product its own scope when sharing a distribution repository.                                                                                                                                          |
| `commitMessage`      | `false`                        | Custom commit message template (`${version}`, `${type}`, `${notes}`); defaults to a conventional commit with the configured scope and the source release type.                                                                                                                                                 |
| `releaseConfigFiles` | `[]`                           | JSON or other support files copied beside the release config before nested semantic-release runs.                                                                                                                                                                                                              |

The building blocks (`BundleBuilder`, `IonCubeEncoder`, `DistributionRepoPublisher`) are exported from the subpath for local builds and development helpers. Additional exports support that use case:

- **`WhmcsBuildPlugin.build(pluginConfig, options)`** — builds the bundle only (no publish), constructing the context from plain options (`version`, `type`, `notes`, `repositoryUrl`, `cwd`, `env`, `logger`) so callers never build a context themselves.
- **`createStandaloneContext(options)`** — the context builder used by local helpers that need a semantic-release-shaped context.
- **`resolveFiles(patterns, { cwd })`** and **`cleanupPaths(paths, { cwd, logger })`** — the glob-resolving and directory-removal helpers the plugin uses internally, exported for consumers that want the same file-handling behavior in their own scripts.

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
