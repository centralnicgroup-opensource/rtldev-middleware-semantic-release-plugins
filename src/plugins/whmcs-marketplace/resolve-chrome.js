import fs from "node:fs";
import path from "node:path";
import getError from "./get-error.js";

/**
 * Relative locations of the Chrome binary inside a `@puppeteer/browsers`
 * download directory, per platform. Chrome for Testing lays these out by
 * platform, and only the matching one exists on a given machine.
 */
export function browserRelativePaths(platform = process.platform) {
  if (platform === "darwin") {
    return [
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ];
  }

  if (platform === "win32") {
    return ["chrome-win64/chrome.exe", "chrome-win32/chrome.exe"];
  }

  return ["chrome-linux64/chrome"];
}

/**
 * Every candidate binary in a puppeteer cache directory, newest download
 * first. Pure so the ordering can be tested without a populated cache.
 */
export function chromeCandidates(
  cacheDir,
  versions,
  platform = process.platform,
) {
  const relativePaths = browserRelativePaths(platform);

  return [...versions]
    .sort()
    .reverse()
    .flatMap((version) =>
      relativePaths.map((relativePath) =>
        path.join(cacheDir, "chrome", version, relativePath),
      ),
    );
}

function scanCache(cacheDir) {
  try {
    const chromeDir = path.join(cacheDir, "chrome");
    const versions = fs.readdirSync(chromeDir).filter(Boolean);
    return chromeCandidates(cacheDir, versions).find((candidate) =>
      fs.existsSync(candidate),
    );
  } catch {
    return undefined;
  }
}

/**
 * Locates the browser to drive. Puppeteer's own resolution is only one of the
 * candidates: the release may run with a project-local `PUPPETEER_CACHE_DIR`
 * that a separate CI step populated, which puppeteer does not see unless the
 * variable was already set when it was imported.
 */
export default function resolveChromeExecutable(
  config,
  puppeteer,
  debug = () => {},
) {
  const candidates = [
    config.executablePath || undefined,
    scanCache(config.cacheDir),
    safeExecutablePath(puppeteer, debug),
    config.homeCacheDir ? scanCache(config.homeCacheDir) : undefined,
  ];

  for (const candidate of candidates) {
    // Only paths, not just anything truthy: puppeteer.executablePath() answers
    // with an empty object rather than throwing when it has no browser of its
    // own, and fs.existsSync of that is a deprecation warning today and a
    // TypeError in a later Node.
    if (
      typeof candidate === "string" &&
      candidate &&
      fs.existsSync(candidate)
    ) {
      debug("resolved Chrome executable: %s", candidate);
      return candidate;
    }
  }

  debug(
    "no Chrome found (cacheDir: %s, PUPPETEER_EXECUTABLE_PATH: %s)",
    config.cacheDir,
    config.executablePath || "<unset>",
  );
  throw getError("ChromeNotFound");
}

function safeExecutablePath(puppeteer, debug) {
  try {
    return puppeteer.executablePath();
  } catch (error) {
    debug("puppeteer.executablePath() failed: %s", error.message);
    return undefined;
  }
}
