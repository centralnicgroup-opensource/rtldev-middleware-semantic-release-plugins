import SemanticReleaseError from "@semantic-release/error";
import { glob } from "glob";
import { SemanticReleasePlugin } from "../../core/index.js";
import { add, commit, push } from "./git.js";
import {
  deploy,
  testMvn,
  updateSnapshotVersion,
  updateVersion,
} from "./maven.js";
import { evaluateConfig } from "./plugin-config.js";

export default class MavenSemanticReleasePlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "maven-semantic-release" });
  }

  resolveConfig(pluginConfig) {
    return evaluateConfig(pluginConfig);
  }

  async afterVerify(config, _pluginConfig, { logger }) {
    await testMvn(logger, config.mvnw);
  }

  async prepare(pluginConfig, { logger, nextRelease }) {
    logger.log("prepare maven release");

    if (!nextRelease?.version) {
      throw new SemanticReleaseError(
        "Cannot prepare maven release without a version",
      );
    }

    const { settingsPath, processAllModules, debug, mvnw, opts } =
      await this.resolveConfig(pluginConfig);
    await updateVersion(
      logger,
      mvnw,
      nextRelease.version,
      settingsPath,
      processAllModules,
      debug,
      opts,
    );
  }

  async publish(pluginConfig, { logger, nextRelease }) {
    logger.log("publish mvn release");

    if (!nextRelease?.version) {
      throw new SemanticReleaseError(
        "Cannot publish mvn release without a version",
      );
    }

    const { settingsPath, mavenTarget, clean, debug, mvnw, opts } =
      await this.resolveConfig(pluginConfig);
    await deploy(
      logger,
      mvnw,
      nextRelease.version,
      mavenTarget,
      settingsPath,
      clean,
      debug,
      opts,
    );
  }

  async success(pluginConfig, { logger, env, cwd, branch, options }) {
    const {
      updateSnapshotVersion: updateSnapshotVersionOpt,
      snapshotCommitMessage,
      processAllModules,
      debug,
      settingsPath,
      mvnw,
      opts,
    } = await this.resolveConfig(pluginConfig);

    if (!updateSnapshotVersionOpt) {
      return;
    }

    await updateSnapshotVersion(
      logger,
      mvnw,
      settingsPath,
      processAllModules,
      debug,
      opts,
    );

    if (!options?.repositoryUrl) {
      logger.error("No git repository url configured. No files are committed.");
      return;
    }

    const filesToCommit = await glob("**/pom.xml", {
      cwd,
      ignore: "node_modules/**",
    });

    const execaOptions = { env, cwd };
    logger.log(`Staging all changed files: ${filesToCommit.join(", ")}`);
    await add(filesToCommit, execaOptions);
    logger.log("Committing all changed pom.xml");
    await commit(snapshotCommitMessage, execaOptions);
    logger.log("Pushing commit");
    await push(options.repositoryUrl, branch.name, execaOptions);
  }
}
