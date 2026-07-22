import { existsSync } from "node:fs";
import path from "node:path";
import { execa } from "execa";
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
 * lifecycle hooks. Local build and development helpers need the same shape,
 * so this is the one place that constructs it.
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
    return this.configs(config).flatMap((build) =>
      runConfigValidators(build, [
        validateRequiredConfig("archiveFileName", "ArchiveFileNameRequired"),
        (cfg) =>
          cfg.composer && !cfg.composer.script
            ? "ComposerScriptRequired"
            : null,
        (cfg) =>
          cfg.encrypt && !cfg.encrypt.encoderPath
            ? "EncoderPathRequired"
            : null,
        (cfg) =>
          cfg.encrypt && !cfg.encrypt.commands.length
            ? "EncoderCommandsRequired"
            : null,
        (cfg) =>
          cfg.beforeBuild && !cfg.beforeBuild.command
            ? "BeforeBuildCommandRequired"
            : null,
        (cfg) =>
          cfg.distributionRepo && !cfg.distributionRepo.url
            ? "DistributionRepoUrlRequired"
            : null,
      ]),
    );
  }

  async afterVerify(config, _pluginConfig, context) {
    for (const build of this.configs(config)) {
      if (
        build.encrypt &&
        !existsSync(path.resolve(build.cwd, build.encrypt.encoderPath))
      ) {
        throw getError("EncoderNotFound");
      }

      if (
        build.distributionRepo &&
        !getContextEnv(context)[build.distributionRepo.tokenEnv]
      ) {
        throw getError("NoDistributionRepoToken");
      }

      if (build.logoStamp) {
        try {
          await import("skia-canvas");
        } catch {
          throw getError("SkiaCanvasMissing");
        }
      }
    }
  }

  configs(config) {
    return config.builds || [config];
  }

  async prepare(pluginConfig, context) {
    await this.ensureVerified(pluginConfig, context);

    const resolved = await this.resolveConfig(pluginConfig, context);
    for (const config of this.configs(resolved)) {
      await this.prepareBuild(config, context);
    }
  }

  async prepareBuild(config, context) {
    const { logger = console, nextRelease } = context;
    const builder = new BundleBuilder(config, logger);

    if (config.beforeBuild) {
      logger.log(`Running ${config.beforeBuild.command}`);
      await execa(config.beforeBuild.command, config.beforeBuild.args, {
        cwd: config.cwd,
        stdio: "inherit",
      });
    }

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
    const resolved = await this.resolveConfig(pluginConfig, context);
    const builds = this.configs(resolved);
    const publishable = builds.filter((config) => config.distributionRepo);

    if (!publishable.length) {
      context.logger?.log?.(
        "No distribution repository configured, skipping publish.",
      );
      return;
    }

    for (const config of publishable) {
      const publisher = new DistributionRepoPublisher(config, context);
      await publisher.publish(context.nextRelease);
    }
  }

  /**
   * Convenience for standalone callers that only want to build the bundle,
   * no publish: builds the context from plain options so callers never
   * construct one themselves.
   */
  async build(pluginConfig, options = {}) {
    const context = createStandaloneContext(options);
    const buildConfig = pluginConfig.builds
      ? {
          ...pluginConfig,
          builds: pluginConfig.builds.map((build) => ({
            ...build,
            distributionRepo: false,
          })),
        }
      : { ...pluginConfig, distributionRepo: false };
    await this.prepare(buildConfig, context);
    return context;
  }
}
