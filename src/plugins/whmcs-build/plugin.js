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
      await stampVersionOnLogo(config.logoStamp, nextRelease.version, {
        cwd: config.cwd,
        logger,
      });
    }

    await builder.composerUpdate();
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
      logger.log("Nothing to encrypt!");
      return;
    }

    const encoder = new IonCubeEncoder(config.encrypt, logger);
    await encoder.withLicense(async () => {
      await encoder.encryptFiles(files, {
        cwd: config.cwd,
        outputDir: config.archiveBuildPath,
      });
      await encoder.verifyEncrypted(files, {
        cwd: config.cwd,
        outputDir: config.archiveBuildPath,
      });
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
}
