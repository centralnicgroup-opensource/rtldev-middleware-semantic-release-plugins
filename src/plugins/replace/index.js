import { replaceInFile } from "replace-in-file";

function applyContextToCallback(callback, context) {
  return (...args) => callback.apply(null, args.concat(context));
}

function applyContextToReplacement(to, context) {
  return typeof to === "function"
    ? applyContextToCallback(to, context)
    : new Function(...Object.keys(context), `return \`${to}\`;`)(
        ...Object.values(context),
      );
}

function normalizeToArray(value) {
  return value instanceof Array ? value : [value];
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function deepDiff(obj1, obj2, path = "") {
  let differences = [];

  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  ) {
    if (obj1 !== obj2) {
      differences.push(`Difference at ${path}: ${obj1} !== ${obj2}`);
    }
    return differences;
  }

  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  for (const key of keys) {
    const newPath = path ? `${path}.${key}` : key;
    differences = differences.concat(deepDiff(obj1[key], obj2[key], newPath));
  }

  return differences;
}

export async function prepare(pluginConfig, context) {
  for (const replacement of pluginConfig.replacements) {
    let { results, ...replacementConfig } = replacement;

    context.logger?.log?.(
      `Searching for files matching: ${JSON.stringify(replacementConfig.files)}`,
    );

    const replaceInFileConfig = {
      ...replacementConfig,
      from: replacementConfig.from ?? [],
      to: replacementConfig.to ?? [],
    };

    replaceInFileConfig.from = normalizeToArray(replaceInFileConfig.from).map(
      (from) => {
        switch (typeof from) {
          case "function":
            return applyContextToCallback(from, context);
          case "string":
            return new RegExp(from, "gm");
          default:
            return from;
        }
      },
    );

    replaceInFileConfig.to =
      replaceInFileConfig.to instanceof Array
        ? replaceInFileConfig.to.map((to) =>
            applyContextToReplacement(to, context),
          )
        : applyContextToReplacement(replaceInFileConfig.to, context);

    let actual = await replaceInFile(replaceInFileConfig);

    if (actual && actual.length > 0) {
      context.logger?.log?.(
        `Files processed: ${actual.length} file(s) matched and updated`,
      );
      actual.forEach((file) => {
        context.logger?.log?.(
          `${file.file}: ${file.numReplacements ?? 0} replacement(s) made (${file.numMatches ?? 0} match(es))`,
        );
      });
    } else {
      context.logger?.warn?.(
        `No files found matching pattern: ${JSON.stringify(replacementConfig.files)}`,
      );
    }

    if (results) {
      results = results.sort();
      actual = actual.sort();

      if (!deepEqual([...actual].sort(), [...results].sort())) {
        const difference = deepDiff(actual, results);
        throw new Error(
          [
            "Replacement validation failed.",
            "",
            "Expected results did not match actual results.",
            "",
            "Possible causes:",
            "  - File glob pattern did not match expected files",
            "  - Regex pattern did not find expected matches",
            "  - Check for proper escaping in JSON",
            "  - Verify numMatches and numReplacements expectations",
            "",
            "Details:",
            ...difference.map((entry) => `  ${entry}`),
          ].join("\n"),
        );
      }
    }
  }
}

export default { prepare };
