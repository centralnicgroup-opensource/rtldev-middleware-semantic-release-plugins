import { execa } from "execa";
import { generateNotes } from "../index.js";

const COMMIT_SEPARATOR = "<<<<COMMIT>>>>";

/**
 * Renders the notes for the commits since a tag, with the configuration the
 * release itself uses. Writes nothing and calls no API - it exists so a
 * repository can see how a release will read before making one.
 *
 * @param {object} pluginConfig The same options whmcs-build is configured with.
 * @param {object} options
 * @param {string} options.cwd Repository to read commits from.
 * @param {string} options.repositoryUrl Used for the compare and commit links.
 * @param {string} [options.since] Tag or ref to start at. Defaults to the most
 *   recent tag matching `tagPattern`.
 * @param {string} [options.tagPattern] glob for `git describe --match`.
 * @param {string} [options.version] Version shown in the rendered header.
 * @returns {Promise<string>} The rendered notes.
 */
export async function previewNotes(
  pluginConfig,
  { cwd, repositoryUrl, since, tagPattern = "*", version = "next" },
) {
  const git = async (args) => (await execa("git", args, { cwd })).stdout.trim();
  const previousTag =
    since ||
    (await git([
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      tagPattern,
    ]).catch(() => ""));

  const log = await git([
    "log",
    `--format=%H%x1f%B${COMMIT_SEPARATOR}`,
    ...(previousTag ? [`${previousTag}..HEAD`] : []),
  ]);
  const commits = log
    .split(COMMIT_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, message] = entry.split("\x1f");
      return { hash, message: message.trim() };
    });

  if (commits.length === 0) {
    return "";
  }

  return generateNotes(pluginConfig, {
    cwd,
    env: process.env,
    logger: console,
    options: { repositoryUrl },
    lastRelease: { gitTag: previousTag },
    nextRelease: { version, gitTag: version },
    commits,
  });
}
