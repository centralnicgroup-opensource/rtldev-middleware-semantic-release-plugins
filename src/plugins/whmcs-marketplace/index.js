import { createPluginHooks } from "../../core/index.js";
import WhmcsMarketplacePlugin from "./plugin.js";

const plugin = new WhmcsMarketplacePlugin();

const hooks = createPluginHooks(plugin, [
  "verifyConditions",
  "publish",
  "fail",
]);

export const verifyConditions = hooks.verifyConditions;
export const publish = hooks.publish;
export const fail = hooks.fail;

// Marketplace maintenance operations. They are not semantic-release hooks:
// they take the same `(pluginConfig, context)` shape so a project's own CLI can
// drive the listing outside a release.
export const syncVersions = plugin.syncVersions.bind(plugin);
export const deleteVersion = plugin.deleteVersion.bind(plugin);
export const updateCompatibility = plugin.updateCompatibility.bind(plugin);
export const marketplaceVersions = plugin.marketplaceVersions.bind(plugin);
export const githubReleases = plugin.githubReleases.bind(plugin);

// Building blocks for development helpers outside a release.
export { default as WhmcsMarketplacePlugin } from "./plugin.js";
export { default as resolveConfig } from "./resolve-config.js";
export {
  default as MarketplaceSession,
  withSession,
  launchArgs,
} from "./session.js";
export { shouldCheckVersion } from "./compatible-versions.js";
export { releaseVersion } from "./github-releases.js";
export { default as installBrowser } from "./install-browser.js";

export default hooks;
