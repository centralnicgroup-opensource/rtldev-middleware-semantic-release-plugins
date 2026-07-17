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
