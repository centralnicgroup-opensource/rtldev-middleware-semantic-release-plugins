import { createPluginHooks } from "../../core/index.js";
import WhmcsBuildPlugin from "./plugin.js";

const hooks = createPluginHooks(new WhmcsBuildPlugin(), [
  "verifyConditions",
  "prepare",
  "publish",
]);

export const verifyConditions = hooks.verifyConditions;
export const prepare = hooks.prepare;
export const publish = hooks.publish;

// Building blocks for standalone use, e.g. module releases that are
// triggered manually with an explicit version rather than derived from a
// semantic-release run.
export {
  default as WhmcsBuildPlugin,
  createStandaloneContext,
} from "./plugin.js";
export { default as BundleBuilder } from "./bundle-builder.js";
export { default as IonCubeEncoder } from "./ioncube-encoder.js";
export { default as DistributionRepoPublisher } from "./distribution-repo-publisher.js";
export { default as resolveConfig } from "./resolve-config.js";
export { resolveFiles, cleanupPaths } from "./files.js";

export default hooks;
