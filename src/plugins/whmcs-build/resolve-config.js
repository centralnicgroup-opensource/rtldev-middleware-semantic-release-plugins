import { readFileSync } from "node:fs";
import path from "node:path";
import { getContextEnv, isDebugEnabled } from "../../core/index.js";

function mergeOrDisable(base, override) {
  if (override === undefined) return base;
  if (override === false) return false;
  return { ...base, ...override };
}

function mergeProfile(base, override, profileName) {
  const profile = {
    ...base,
    ...override,
    composer: mergeOrDisable(base.composer, override.composer),
    encrypt: mergeOrDisable(base.encrypt, override.encrypt),
    distributionRepo: mergeOrDisable(
      base.distributionRepo,
      override.distributionRepo,
    ),
  };

  // composer.sh uses the profile name to select composer.<profile>.json;
  // its `internal` profile intentionally maps back to composer.json.
  if (profile.composer) {
    profile.composer = {
      ...profile.composer,
      module: profileName,
    };
  }

  return profile;
}

/**
 * Load build options from JSON. `profiles` selects named entries from the
 * file and returns them as one multi-build configuration; inline options are
 * kept as plugin-level overrides (for example distributionRepo).
 */
function applyConfigFile(pluginConfig, cwd) {
  const { configFile, profiles, ...inline } = pluginConfig;
  if (!configFile) {
    return pluginConfig;
  }

  const filePath = path.resolve(cwd, configFile);
  const fileConfig = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(profiles)) {
    return { ...fileConfig, ...inline };
  }

  const { profiles: definitions = {}, ...base } = fileConfig;
  return {
    ...inline,
    builds: profiles.map((profileName) => {
      const override = definitions[profileName];
      if (!override) {
        throw new Error(`No "${profileName}" profile in ${configFile}.`);
      }
      return mergeProfile(base, override, profileName);
    }),
  };
}

function normalizeComposer(composer) {
  if (!composer) {
    return false;
  }

  return {
    script: composer.script || false,
    module: composer.module || "",
  };
}

function normalizeLogoStamp(logoStamp) {
  if (!logoStamp) {
    return false;
  }

  return {
    input: logoStamp.input || false,
    output: logoStamp.output || false,
    fontSize: logoStamp.fontSize || 41,
    color: logoStamp.color || "grey",
    padding: logoStamp.padding || 5,
  };
}

function normalizeEncrypt(encrypt) {
  if (!encrypt) {
    return false;
  }

  return {
    encoderPath: encrypt.encoderPath || false,
    commands: encrypt.commands || [],
    files: encrypt.files || [],
    sudo: encrypt.sudo !== false,
  };
}

function normalizeBeforeBuild(beforeBuild) {
  if (!beforeBuild) {
    return false;
  }

  return {
    command: beforeBuild.command || false,
    args: beforeBuild.args || [],
  };
}

function normalizeDistributionRepo(distributionRepo) {
  if (!distributionRepo) {
    return false;
  }

  return {
    url: distributionRepo.url || false,
    dir: distributionRepo.dir || "distribution-repo",
    branch: distributionRepo.branch || "main",
    // Each entry is either a glob string (copied as-is) or a { from, to }
    // pair that renames the matched file. Normalize both to { from, to },
    // with to = null meaning "keep the source name".
    files: (distributionRepo.files || []).map((entry) =>
      typeof entry === "string" ? { from: entry, to: null } : entry,
    ),
    releaserc: distributionRepo.releaserc || ".releaserc.distribution.json",
    tokenEnv: distributionRepo.tokenEnv || "DISTRIBUTION_REPO_TOKEN",
    runSemanticRelease: distributionRepo.runSemanticRelease !== false,
    releaseTarget: distributionRepo.releaseTarget || false,
    commitScope: distributionRepo.commitScope || "release",
    commitMessage: distributionRepo.commitMessage || false,
    releaseConfigFiles: distributionRepo.releaseConfigFiles || [],
  };
}

function resolveSingleConfig(pluginConfig, context) {
  const env = getContextEnv(context);
  const cwd = context?.cwd || process.cwd();
  const config = applyConfigFile(pluginConfig, cwd);

  return {
    cwd,
    archiveFileName: config.archiveFileName || false,
    archiveSuffix: config.archiveSuffix ?? "-latest",
    archiveBuildPath: config.archiveBuildPath || "build",
    filesForArchive: config.filesForArchive || [],
    filesForArchiveMapping: config.filesForArchiveMapping || {},
    composer: normalizeComposer(config.composer),
    logoStamp: normalizeLogoStamp(config.logoStamp),
    prettier: config.prettier ? { files: config.prettier.files || [] } : false,
    encrypt: normalizeEncrypt(config.encrypt),
    beforeBuild: normalizeBeforeBuild(config.beforeBuild),
    archive: config.archive !== false,
    distributionRepo: normalizeDistributionRepo(config.distributionRepo),
    debug: isDebugEnabled(env, "whmcs-build"),
  };
}

export default (pluginConfig = {}, context) => {
  const cwd = context?.cwd || process.cwd();
  const config = applyConfigFile(pluginConfig, cwd);
  if (!Array.isArray(config.builds)) {
    return resolveSingleConfig(config, context);
  }

  const builds = config.builds.map((build) =>
    resolveSingleConfig(build, context),
  );
  if (config.distributionRepo !== undefined && builds[0]) {
    builds[0].distributionRepo = normalizeDistributionRepo(
      config.distributionRepo,
    );
  }

  return { builds };
};
