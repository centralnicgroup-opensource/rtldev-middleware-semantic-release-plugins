import { rm } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

export function splitPatterns(patterns = []) {
  const include = [];
  const ignore = [];

  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      ignore.push(pattern.slice(1));
    } else {
      include.push(pattern);
    }
  }

  return { include, ignore };
}

export async function resolveFiles(patterns, { cwd = process.cwd() } = {}) {
  const { include, ignore } = splitPatterns(patterns);

  if (!include.length) {
    return [];
  }

  const matches = await glob(include, {
    cwd,
    ignore,
    dot: true,
    nodir: true,
    posix: true,
  });

  return [...new Set(matches)].sort();
}

/**
 * Removes each path (recursively, if it exists) - runtime/cache directories
 * left behind by a build (e.g. compiled templates, test caches) that aren't
 * needed for the release itself. Not called automatically by `prepare()`,
 * since not every consumer wants this after every build - call it explicitly
 * when you do.
 */
export async function cleanupPaths(
  paths = [],
  { cwd = process.cwd(), logger = console } = {},
) {
  for (const target of paths) {
    await rm(path.resolve(cwd, target), { recursive: true, force: true });
    logger.log(`Removed ${target}`);
  }
}
