import { readFileSync } from "node:fs";
import path from "node:path";
import { getContextEnv, isDebugEnabled } from "../../core/index.js";

/**
 * When `configFile` is set, load that JSON file (relative to cwd) as the
 * base options and let any inline pluginConfig keys override it. This lets a
 * static `.releaserc.json` share one config file with other consumers (e.g. a
 * CLI) instead of duplicating every option inline.
 */
function applyConfigFile(pluginConfig, cwd) {
  if (!pluginConfig.configFile) {
    return pluginConfig;
  }

  const filePath = path.resolve(cwd, pluginConfig.configFile);
  const fileConfig = JSON.parse(readFileSync(filePath, "utf8"));
  const { configFile, ...inline } = pluginConfig;
  return { ...fileConfig, ...inline };
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
    commitMessage: distributionRepo.commitMessage || false,
  };
}

export default (pluginConfig = {}, context) => {
  const env = getContextEnv(context);
  const cwd = context?.cwd || process.cwd();
  const config = applyConfigFile(pluginConfig, cwd);

  return {
    cwd,
    archiveFileName: config.archiveFileName || false,
    archiveBuildPath: config.archiveBuildPath || "build",
    filesForArchive: config.filesForArchive || [],
    filesForArchiveMapping: config.filesForArchiveMapping || {},
    composer: normalizeComposer(config.composer),
    logoStamp: normalizeLogoStamp(config.logoStamp),
    prettier: config.prettier ? { files: config.prettier.files || [] } : false,
    encrypt: normalizeEncrypt(config.encrypt),
    archive: config.archive !== false,
    distributionRepo: normalizeDistributionRepo(config.distributionRepo),
    debug: isDebugEnabled(env, "whmcs-build"),
  };
};
