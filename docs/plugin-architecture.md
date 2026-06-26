# Plugin Architecture

Semantic-release expects plugins to expose plain lifecycle hook functions such as `verifyConditions`, `prepare`, `publish`, `success`, and `generateNotes`. This repository publishes one package with multiple plugin subpath exports. Internally, each plugin can still use an object-oriented model and export those methods through a small adapter.

## Shared Core

`src/core` provides common behavior:

- `SemanticReleasePlugin` base class
- `createPluginHooks` adapter for semantic-release exports
- `createSemanticReleaseError` for shared error definitions
- `throwIfErrors` for aggregate validation failures
- `validateRequiredConfig`, `validateUrlConfig`, and `runConfigValidators` for repeated config checks
- `afterVerify` for plugins that need external checks during `verifyConditions`
- context/env helpers
- markdown release-note cleanup helpers

The package is ESM-first. Because this is a new canonical repository, it avoids compatibility adapters and keeps one implementation style.

## Package Pattern

Each plugin subpath keeps only domain-specific behavior:

```js
class MyPlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "my-plugin", getError });
  }

  resolveConfig(pluginConfig, context) {
    return resolveConfig(pluginConfig, context);
  }

  validateConfig(config) {
    return runConfigValidators(config, [
      validateRequiredConfig("requiredValue", "MissingRequiredValue"),
    ]);
  }

  async afterVerify(config, pluginConfig, context) {
    // optional external checks, such as testing that a binary exists
  }

  async prepare(pluginConfig, context) {
    // plugin-specific behavior only
  }
}

const hooks = createPluginHooks(new MyPlugin(), [
  "verifyConditions",
  "prepare",
]);

export const verifyConditions = hooks.verifyConditions;
export const prepare = hooks.prepare;
export default hooks;
```

## Why This Helps

This removes repeated lifecycle boilerplate from every plugin:

- no local `let verified` state per package
- no repeated AggregateError creation
- no repeated verify-before-success logic
- no repeated non-fatal optional hook wrapping
- no repeated required-field or URL validation code
- consistent error construction
- consistent semantic-release exports

## Current Coverage

- `rtldev-middleware-semantic-release-plugins/notes-override` uses the base class and shared validators.
- `rtldev-middleware-semantic-release-plugins/notify` uses the base class, shared validators, and optional `success` hook handling.
- `rtldev-middleware-semantic-release-plugins/maven` uses the base class and `afterVerify` for the Maven executable check.
- `rtldev-middleware-semantic-release-plugins/replace` is a focused prepare hook for file replacements.

## Recommended Next Refactors

- Move shared release-note parsing from notify/notes-override into `core` once consumers agree on exact output formatting.
- Add plugin-specific subclasses for any future lifecycle-heavy plugins instead of exporting raw hook functions directly.
