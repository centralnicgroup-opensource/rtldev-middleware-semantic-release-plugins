import { createPluginHooks } from "../../core/index.js";
import MavenSemanticReleasePlugin from "./plugin.js";

const hooks = createPluginHooks(new MavenSemanticReleasePlugin(), [
  "verifyConditions",
  "prepare",
  "publish",
  "success",
]);

export const verifyConditions = hooks.verifyConditions;
export const prepare = hooks.prepare;
export const publish = hooks.publish;
export const success = hooks.success;

export default hooks;
