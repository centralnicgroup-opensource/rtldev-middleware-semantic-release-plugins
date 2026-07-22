import { existsSync } from "node:fs";
import path from "node:path";
import {
  SemanticReleasePlugin,
  getContextEnv,
  runConfigValidators,
  validateRequiredConfig,
} from "../../core/index.js";
import BundleBuilder from "./bundle-builder.js";
import { resolveFiles } from "./files.js";
import getError from "./get-error.js";
import DistributionRepoPublisher from "./distribution-repo-publisher.js";
import IonCubeEncoder from "./ioncube-encoder.js";
import stampVersionOnLogo from "./logo-stamper.js";
import resolveConfig from "./resolve-config.js";

/**
 * Builds the context object semantic-release normally passes to a plugin's
 * lifecycle hooks. Standalone callers (anything driving WhmcsBuildPlugin
 * outside of a real semantic-release run, e.g. a manually-versioned release)
 * need this same shape - this is the one place that builds it.
 */
export function createStandaloneContext({
  version,
  type,
  notes,
  repositoryUrl,
  cwd = process.cwd(),
  env = process.env,
  logger = console,
} = {}) {
  return {
    cwd,
    env,
    logger,
    options: { repositoryUrl },
    nextRelease: { version, type, notes: notes || "" },
  };
}

export default class WhmcsBuildPlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "whmcs-build", getError });
  }

  resolveConfig(pluginConfig, context) {
    return resolveConfig(pluginConfig, context);
  }

  validateConfig(config) {
    return runConfigValidators(config, [
      validateRequiredConfig("archiveFileName", "ArchiveFileNameRequired"),
      (cfg) =>
        cfg.composer && !cfg.composer.script ? "ComposerScriptRequired" : null,
      (cfg) =>
        cfg.encrypt && !cfg.encrypt.encoderPath ? "EncoderPathRequired" : null,
      (cfg) =>
        cfg.encrypt && !cfg.encrypt.commands.length
          ? "EncoderCommandsRequired"
          : null,
      (cfg) =>
        cfg.distributionRepo && !cfg.distributionRepo.url
          ? "DistributionRepoUrlRequired"
          : null,
    ]);
  }

  async afterVerify(config, _pluginConfig, context) {
    if (
      config.encrypt &&
      !existsSync(path.resolve(config.cwd, config.encrypt.encoderPath))
    ) {
      throw getError("EncoderNotFound");
    }

    if (
      config.distributionRepo &&
      !getContextEnv(context)[config.distributionRepo.tokenEnv]
    ) {
      throw getError("NoDistributionRepoToken");
    }

    if (config.logoStamp) {
      try {
        await import("skia-canvas");
      } catch {
        throw getError("SkiaCanvasMissing");
      }
    }
  }

  async prepare(pluginConfig, context) {
    await this.ensureVerified(pluginConfig, context);

    const config = await this.resolveConfig(pluginConfig, context);
    const { logger = console, nextRelease } = context;
    const builder = new BundleBuilder(config, logger);

    if (config.logoStamp) {
      if (nextRelease?.version) {
        await stampVersionOnLogo(config.logoStamp, nextRelease.version, {
          cwd: config.cwd,
          logger,
        });
      } else {
        logger.log("Skipping logo stamp: no release version in context.");
      }
    }

    await builder.runComposer();
    await builder.clean();
    await builder.copyFiles();
    await builder.copyMappings();
    await builder.formatWithPrettier();

    if (config.encrypt) {
      await this.encrypt(config, logger);
    }

    await builder.buildArchive();
  }

  async encrypt(config, logger) {
    const files = await resolveFiles(config.encrypt.files, {
      cwd: config.cwd,
    });

    if (!files.length) {
      throw new Error(
        "Encryption is enabled but no files matched `encrypt.files`.",
      );
    }

    const encoder = new IonCubeEncoder(config.encrypt, logger);
    await encoder.encryptAndVerify(files, {
      cwd: config.cwd,
      outputDir: config.archiveBuildPath,
    });
  }

  async publish(pluginConfig, context) {
    const config = await this.resolveConfig(pluginConfig, context);

    if (!config.distributionRepo) {
      context.logger?.log?.(
        "No distribution repository configured, skipping publish.",
      );
      return;
    }

    const publisher = new DistributionRepoPublisher(config, context);
    await publisher.publish(context.nextRelease);
  }

  /**
   * Convenience for standalone callers that only want to build the bundle,
   * no publish: builds the context from plain options so callers never
   * construct one themselves. The build-only counterpart to `release()`.
   */
  async build(pluginConfig, options = {}) {
    const context = createStandaloneContext(options);
    await this.prepare({ ...pluginConfig, distributionRepo: false }, context);
    return context;
  }

  /**
   * Convenience for standalone callers: builds then publishes in one call,
   * from plain options instead of a real semantic-release invocation.
   * Useful for releases triggered manually with an explicit version rather
   * than derived from commit history (e.g. a module that versions itself
   * independently).
   */
  async release(pluginConfig, options = {}) {
    const context = createStandaloneContext(options);
    await this.prepare(pluginConfig, context);
    await this.publish(pluginConfig, context);
    return context;
  }
}
