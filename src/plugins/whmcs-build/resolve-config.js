import { getContextEnv, isDebugEnabled } from "../../core/index.js";

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

  return {
    cwd: context?.cwd || process.cwd(),
    archiveFileName: pluginConfig.archiveFileName || false,
    archiveBuildPath: pluginConfig.archiveBuildPath || "build",
    filesForArchive: pluginConfig.filesForArchive || [],
    filesForArchiveMapping: pluginConfig.filesForArchiveMapping || {},
    composer: normalizeComposer(pluginConfig.composer),
    logoStamp: normalizeLogoStamp(pluginConfig.logoStamp),
    prettier: pluginConfig.prettier
      ? { files: pluginConfig.prettier.files || [] }
      : false,
    encrypt: normalizeEncrypt(pluginConfig.encrypt),
    archive: pluginConfig.archive !== false,
    distributionRepo: normalizeDistributionRepo(pluginConfig.distributionRepo),
    debug: isDebugEnabled(env, "whmcs-build"),
  };
};
