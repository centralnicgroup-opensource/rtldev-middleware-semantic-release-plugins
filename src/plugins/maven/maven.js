import SemanticReleaseError from "@semantic-release/error";
import { exec } from "./exec.js";

function settingsOption(settingsPath) {
  return settingsPath ? ["--settings", settingsPath] : [];
}

function setOpts(additionalOpts) {
  return additionalOpts ? additionalOpts.split(" ") : [];
}

export async function updateVersion(
  logger,
  mvnw,
  versionStr,
  settingsPath,
  processAllModules,
  debug,
  options,
  runner = exec,
) {
  logger.log(`Updating pom.xml to version ${versionStr}`);

  const command = mvnw ? "./mvnw" : "mvn";
  const processAllModulesOption = processAllModules
    ? ["-DprocessAllModules"]
    : [];
  const debugOption = debug ? ["-X"] : [];

  try {
    await runner(command, [
      "versions:set",
      ...settingsOption(settingsPath),
      ...debugOption,
      "--batch-mode",
      "--no-transfer-progress",
      "-DgenerateBackupPoms=false",
      `-DnewVersion=${versionStr}`,
      ...processAllModulesOption,
      ...setOpts(options),
    ]);
  } catch (error) {
    logger.error("Failed to update version");
    logger.error(error);
    throw new SemanticReleaseError("Failed to update version");
  }
}

export async function updateSnapshotVersion(
  logger,
  mvnw,
  settingsPath,
  processAllModules,
  debug,
  options,
  runner = exec,
) {
  logger.log("Update pom.xml to next snapshot version");

  const command = mvnw ? "./mvnw" : "mvn";
  const processAllModulesOption = processAllModules
    ? ["-DprocessAllModules"]
    : [];
  const debugOption = debug ? ["-X"] : [];

  try {
    await runner(command, [
      "versions:set",
      ...settingsOption(settingsPath),
      ...debugOption,
      "--batch-mode",
      "--no-transfer-progress",
      "-DnextSnapshot=true",
      "-DgenerateBackupPoms=false",
      ...processAllModulesOption,
      ...setOpts(options),
    ]);
  } catch (error) {
    logger.error("Failed to update snapshot version");
    logger.error(error);
    throw new SemanticReleaseError("Failed to update snapshot version");
  }
}

export async function deploy(
  logger,
  mvnw,
  nextVersion,
  mavenTarget,
  settingsPath,
  clean,
  debug,
  options,
  runner = exec,
) {
  logger.log(`Deploying version ${nextVersion} with maven`);

  const command = mvnw ? "./mvnw" : "mvn";
  const cleanOption = clean ? ["clean"] : [];
  const debugOption = debug ? ["-X"] : [];

  try {
    await runner(command, [
      ...cleanOption,
      ...mavenTarget.split(" "),
      ...settingsOption(settingsPath),
      ...debugOption,
      "--batch-mode",
      "--no-transfer-progress",
      "-DskipTests",
      ...setOpts(options),
    ]);
  } catch (error) {
    logger.error("Failed to deploy to maven");
    logger.error(error);
    throw new SemanticReleaseError("Failed to deploy to maven");
  }
}

export async function testMvn(logger, mvnw, runner = exec) {
  logger.log("Testing if mvn exists");

  const command = mvnw ? "./mvnw" : "mvn";

  try {
    await runner(command, ["-v"]);
  } catch (error) {
    logger.error("Failed to run mvn");
    logger.error(error);
    throw new SemanticReleaseError("Failed to run mvn");
  }
}
