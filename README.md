# rtldev-middleware-semantic-release-plugins

Single package for CentralNic semantic-release plugins.

## Install

```sh
pnpm add -D @centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins
```

## Plugin Subpaths

- `@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/notes-override`
- `@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/notify`
- `@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/teams-notify`
- `@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/replace`
- `@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/maven`

## Example

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/replace",
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
    "@centralnicgroup-opensource/rtldev-middleware-semantic-release-plugins/notify",
    "@semantic-release/github"
  ]
}
```

## Deprecated Repositories

The old one-plugin-per-repository setup should be deprecated in favor of this package. Consumers should migrate to the subpath plugin names above.

`semantic-release-whmcs` is intentionally excluded from the first migration because it carries WHMCS Marketplace, Puppeteer, Chrome, and credential-specific behavior.

## Development

```sh
pnpm install
pnpm run ci
```
