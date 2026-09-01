import createDebug from "./debug.js";
import getError from "./get-error.js";

const API_BASE = "https://api.github.com";

/** The released version of a GitHub release, without a leading `v`. */
export function releaseVersion(release) {
  return String(release?.name || release?.tag_name || "").replace(/^v/, "");
}

/**
 * Reads the repository's GitHub releases, oldest first, so missing versions
 * can be added to the Marketplace in the order they were released.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);

  if (!config.githubToken) {
    throw getError("NoGithubToken");
  }

  if (!config.githubRepo) {
    throw getError("NoGithubRepo");
  }

  const [owner, repo] = config.githubRepo.split("/");
  const url = `${API_BASE}/repos/${owner}/${repo}/releases?per_page=100`;
  debug("reading releases from %s", url);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "team-internet-semantic-release-plugins",
      },
    });

    if (!response.ok) {
      debug(
        "reading releases failed: %s %s",
        response.status,
        response.statusText,
      );
      return false;
    }

    const releases = await response.json();
    releases.forEach((release) =>
      debug("detected GitHub release %s", releaseVersion(release)),
    );
    releases.reverse();
    return releases;
  } catch (error) {
    debug("reading releases failed: %s", error.message);
    return false;
  }
};
