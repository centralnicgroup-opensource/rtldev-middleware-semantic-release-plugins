import createDebug from "./debug.js";
import githubReleases, { releaseVersion } from "./github-releases.js";
import marketplaceVersions from "./marketplace-versions.js";
import publishVersion from "./publish-version.js";

/**
 * Adds every GitHub release that is missing from the Marketplace listing,
 * oldest first. Returns the versions that were added.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);
  const releases = await githubReleases(config, context);

  if (!releases?.length) {
    debug("no GitHub releases to synchronise");
    return [];
  }

  const published = await marketplaceVersions(config, context);
  if (published === false) {
    debug("could not read the published versions, nothing synchronised");
    return false;
  }

  const added = [];
  for (const release of releases) {
    const version = releaseVersion(release);
    if (!version || published.includes(version)) {
      continue;
    }

    debug("adding missing version %s", version);
    const result = await publishVersion(config, {
      ...context,
      nextRelease: {
        version,
        notes: release.body,
        releaseDate: release.published_at,
      },
    });

    if (result) {
      added.push(version);
    } else {
      debug("adding version %s failed", version);
    }
  }

  debug("synchronised %d version(s)", added.length);
  return added;
};
