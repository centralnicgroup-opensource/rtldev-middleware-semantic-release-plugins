# rtldev-middleware-semantic-release-plugins

CentralNic semantic-release plugin collection published as one npm package with multiple subpath exports.

Use this package when a release pipeline needs CentralNic's shared helpers for Maven publishing, release-note overrides, Teams notifications, or release-time file replacements.

The package name matches the repository short name: `rtldev-middleware-semantic-release-plugins`. Semantic-release configs use that package name plus the plugin subpath.

## Requirements

- Node.js `^22.14.0 || >=24.10.0`
- pnpm `10.24.0` for repository development
- semantic-release `25` or a compatible release pipeline

## Installation

```sh
pnpm add -D rtldev-middleware-semantic-release-plugins
```

In the examples below, replace `<package>` with `rtldev-middleware-semantic-release-plugins`.

## Published Plugins

| Plugin ID        | semantic-release config value | semantic-release hooks                              | Purpose                                                                                    |
| ---------------- | ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `replace`        | `<package>/replace`           | `prepare`                                           | Replace text in files using semantic-release context values.                               |
| `notify`         | `<package>/notify`            | `verifyConditions`, `success`                       | Send a Microsoft Teams release notification.                                               |
| `teams-notify`   | `<package>/teams-notify`      | `verifyConditions`, `success`                       | Alias for `notify`.                                                                        |
| `notes-override` | `<package>/notes-override`    | `verifyConditions`, `generateNotes`                 | Replace generated release notes with supplied text.                                        |
| `maven`          | `<package>/maven`             | `verifyConditions`, `prepare`, `publish`, `success` | Update Maven versions, publish artifacts, and optionally commit the next snapshot version. |

## Basic Usage

Add the plugin subpath you need to your semantic-release config.

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "rtldev-middleware-semantic-release-plugins/replace",
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
    "rtldev-middleware-semantic-release-plugins/notify",
    "@semantic-release/github"
  ]
}
```

## Plugin Configuration

### `replace`

Runs during `prepare` and delegates file updates to `replace-in-file`. Each replacement can use semantic-release context values in template strings.

```json
[
  "rtldev-middleware-semantic-release-plugins/replace",
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

Supported replacement fields are the standard `replace-in-file` options. String `from` values are converted to global, multiline regular expressions. `to` can be a string, array, or callback.

Set `results` on a replacement when you want the release to fail if the actual replacement result differs from the expected files, matches, or replacement counts.

### `notify` / `teams-notify`

Runs during `success` after configuration has been validated. The hook is optional during release execution: if notification delivery fails, semantic-release continues and logs a warning.

```json
[
  "rtldev-middleware-semantic-release-plugins/notify",
  {
    "teamsWebhook": "https://example.webhook.office.com/...",
    "packageName": "my-service"
  }
]
```

Configuration values can also come from environment variables:

| Setting            | Environment fallback                                                | Required |
| ------------------ | ------------------------------------------------------------------- | -------- |
| `teamsWebhook`     | `TEAMS_NOTIFICATION_URI`                                            | Yes      |
| `githubToken`      | `GH_TOKEN`, `GITHUB_TOKEN`                                          | Yes      |
| `packageName`      | `SEMANTIC_RELEASE_PACKAGE`, `npm_package_name`, `package.json#name` | Yes      |
| `commitSHA`        | `COMMIT_SHA`                                                        | No       |
| `notificationType` | `TEAMS_NOTIFICATION_TYPE`                                           | No       |

Teams notifications target Microsoft Teams Workflows webhooks, created from the Workflows app template "Send webhook alerts to a channel" or equivalent. The default payload uses the Workflows-supported Adaptive Card request body shape. Do not create new webhook URLs with the deprecated "Incoming Webhook (to be retired)" Teams app.

### `notes-override`

Runs during `generateNotes` and returns the configured notes after stripping Markdown links.

```json
[
  "rtldev-middleware-semantic-release-plugins/notes-override",
  {
    "notes": "Release notes supplied by the pipeline"
  }
]
```

The `notes` value can also come from `customReleaseNotes` in the semantic-release environment.

### `maven`

Runs Maven during the release lifecycle:

- `verifyConditions`: checks that `mvn` or `./mvnw` is available.
- `prepare`: updates `pom.xml` files to `nextRelease.version`.
- `publish`: runs the configured Maven target.
- `success`: optionally updates `pom.xml` files to the next snapshot version, commits them, and pushes the commit.

```json
[
  "rtldev-middleware-semantic-release-plugins/maven",
  {
    "mvnw": true,
    "settingsPath": "./settings.xml",
    "mavenTarget": "deploy",
    "processAllModules": true,
    "updateSnapshotVersion": true
  }
]
```

| Option                  | Default                                          | Notes                                                                             |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `mvnw`                  | `false`                                          | Use `./mvnw` instead of `mvn`.                                                    |
| `settingsPath`          | unset                                            | Passed as `--settings`. Only word characters, `~`, `.`, `/`, and `-` are allowed. |
| `mavenTarget`           | `deploy`                                         | One of `deploy`, `package jib:build`, or `deploy jib:build`.                      |
| `clean`                 | `true`                                           | Prefix the publish command with `clean`.                                          |
| `processAllModules`     | `false`                                          | Pass `-DprocessAllModules` to version update commands.                            |
| `updateSnapshotVersion` | `false`                                          | Update to the next snapshot after a successful release.                           |
| `snapshotCommitMessage` | `chore: setting next snapshot version [skip ci]` | Commit message used when `updateSnapshotVersion` is enabled.                      |
| `opts`                  | `""`                                             | Additional Maven arguments split on spaces.                                       |
| `debug`                 | `false`                                          | Add Maven `-X`.                                                                   |

## Debugging

Set `DEBUG` to the plugin namespace that should emit debug output:

```sh
DEBUG=semantic-release:notify pnpm semantic-release
DEBUG=semantic-release:teams-notify pnpm semantic-release
DEBUG=semantic-release:notes-override pnpm semantic-release
```

The Maven plugin also has a `debug: true` option that passes `-X` to Maven.

## Release Troubleshooting

### npm publish returns a registry error

`@semantic-release/npm` writes the release version to `package.json` during `prepare`, then publishes the package during `publish`. If npm returns a registry error during `publish`, the package reached npm but the registry rejected the package name, token, or access rights.

```text
npm error 404 Not Found - PUT https://registry.npmjs.org/rtldev-middleware-semantic-release-plugins
```

Check the npm-side setup for the package:

- The package name `rtldev-middleware-semantic-release-plugins` must be available on npm, or the token must have access if it already exists.
- The token in `RTLDEV_MW_CI_NPM_TOKEN` must belong to an account that can publish this package.
- If the package should publish under a different npm name, update `package.json#name` before releasing.

The warning about npm auto-correcting `repository` means the package metadata was not in npm's preferred object form. It does not cause registry publish failures, but this repository keeps `repository.type` and `repository.url` explicit to avoid that warning.

## Migration From Legacy Packages

The old one-plugin-per-repository setup should be deprecated in favor of this package. Consumers should migrate to the subpath plugin names listed in this README.

`semantic-release-whmcs` is intentionally excluded from the first migration because it carries WHMCS Marketplace, Puppeteer, Chrome, and credential-specific behavior.

## Development

Install dependencies and run the full local check:

```sh
pnpm install
pnpm run ci
```

Useful scripts:

```sh
pnpm run build
pnpm run test
pnpm run test:coverage
pnpm run lint
```

Coverage is generated with Node's built-in test runner and is scoped to `src/**/*.js`.

The Teams webhook integration test is opt-in because it posts to a real endpoint. For local testing, copy `.env.example` to `.env`, set `TEAMS_NOTIFICATION_URI`, and run:

```sh
pnpm run test:teams
```

The GitHub test workflow uses the same variable name via `secrets.TEAMS_NOTIFICATION_URI`.
