import {
  runConfigValidators,
  SemanticReleasePlugin,
  validateUrlConfig,
} from "../../core/index.js";
import getError from "./get-error.js";
import resolveConfig from "./resolve-config.js";
import createDebug from "./debug.js";
import deleteVersionOperation from "./delete-version.js";
import githubReleasesOperation from "./github-releases.js";
import marketplaceVersionsOperation from "./marketplace-versions.js";
import publishVersion from "./publish-version.js";
import syncVersionsOperation from "./sync-versions.js";
import updateCompatibilityOperation from "./compatible-versions.js";
import { assertCookieExtension, loadPuppeteer } from "./session.js";
import resolveChromeExecutable from "./resolve-chrome.js";
import installBrowser from "./install-browser.js";

export default class WhmcsMarketplacePlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "whmcs-marketplace", getError });
    this.publishResult = null;
  }

  resolveConfig(pluginConfig, context) {
    return resolveConfig(pluginConfig, context);
  }

  validateConfig(config) {
    return runConfigValidators(config, [
      (cfg) =>
        !cfg.login || !cfg.password ? "NoMarketplaceCredentials" : null,
      (cfg) => {
        if (!cfg.productId) {
          return "NoProductId";
        }

        return /^[0-9]+$/.test(String(cfg.productId)) &&
          Number.parseInt(cfg.productId, 10) > 0
          ? null
          : "InvalidProductId";
      },
      validateUrlConfig("urlBase", "InvalidMarketplaceUrl"),
    ]);
  }

  /**
   * Asserts what has to be in place before the release starts building: the
   * optional puppeteer peer dependency and the cookie-banner extension.
   *
   * The browser is deliberately not asserted here when `prepare` is going to
   * install it — verifyConditions runs first, so requiring Chrome at this point
   * would fail every release before prepare ever got the chance. With
   * `installBrowser: false` the browser is somebody else's job, and then a
   * missing one is worth failing fast on.
   */
  async afterVerify(config, _pluginConfig, context) {
    const debug = createDebug(config, context);
    assertCookieExtension(config);
    const puppeteer = await loadPuppeteer();

    if (config.installBrowser) {
      debug("browser check deferred to prepare, which installs it");
      return;
    }

    resolveChromeExecutable(config, puppeteer, debug);
  }

  /**
   * Installs the browser the publish will drive. This is a prepare hook rather
   * than a step in the release job so that the download only happens for a
   * push that is actually releasing something: semantic-release skips prepare
   * entirely when no version is due, which is most pushes.
   *
   * Never fails the release. A browser that could not be installed is reported
   * here and again by `publish`, which then adds no release rather than
   * stopping one that is otherwise complete.
   */
  async prepare(pluginConfig, context) {
    await this.ensureVerified(pluginConfig, context);

    const config = await this.resolveConfig(pluginConfig, context);
    await installBrowser(config, context);
  }

  async publish(pluginConfig, context) {
    await this.ensureVerified(pluginConfig, context);

    const logger = context.logger || console;
    const config = await this.resolveConfig(pluginConfig, context);
    const version = context.nextRelease?.version;
    const result = await publishVersion(config, context);

    this.publishResult = { success: Boolean(result), version, result };

    if (result) {
      logger.log(`Published version ${version} to the WHMCS Marketplace.`);
    } else {
      logger.log(
        `Failed to publish version ${version} to the WHMCS Marketplace. Run the marketplace publish again once the cause is fixed; the release itself is unaffected.`,
      );
    }

    return result;
  }

  /**
   * Reports what happened on the Marketplace when another plugin failed the
   * release, so it is clear whether the listing needs cleaning up.
   */
  async fail(_pluginConfig, context) {
    const logger = context.logger || console;

    if (!this.publishResult) {
      logger.log(
        "No WHMCS Marketplace publish was attempted before the failure.",
      );
      return;
    }

    const { success, version } = this.publishResult;
    logger.log(
      success
        ? `Version ${version} was published to the WHMCS Marketplace before the release failed elsewhere.`
        : `Version ${version} was not published to the WHMCS Marketplace.`,
    );
  }

  /** Verifies, resolves the configuration, and runs a marketplace operation. */
  async runOperation(pluginConfig, context, operation) {
    await this.ensureVerified(pluginConfig, context);
    const config = await this.resolveConfig(pluginConfig, context);
    return operation(config, context);
  }

  /** Adds every GitHub release missing from the Marketplace listing. */
  syncVersions(pluginConfig, context) {
    return this.runOperation(pluginConfig, context, syncVersionsOperation);
  }

  /** Deletes `context.version` from the Marketplace listing. */
  deleteVersion(pluginConfig, context) {
    return this.runOperation(pluginConfig, context, deleteVersionOperation);
  }

  /** Ticks the compatible WHMCS versions for the product. */
  updateCompatibility(pluginConfig, context) {
    return this.runOperation(
      pluginConfig,
      context,
      updateCompatibilityOperation,
    );
  }

  /** Lists the versions already published for the product. */
  marketplaceVersions(pluginConfig, context) {
    return this.runOperation(
      pluginConfig,
      context,
      marketplaceVersionsOperation,
    );
  }

  /** Lists the repository's GitHub releases, oldest first. */
  githubReleases(pluginConfig, context) {
    return this.runOperation(pluginConfig, context, githubReleasesOperation);
  }
}
