import {
  createPluginHooks,
  runConfigValidators,
  SemanticReleasePlugin,
  validateRequiredConfig,
  validateUrlConfig,
} from "../../core/index.js";
import resolveConfig from "./resolve-config.js";
import getError from "./get-error.js";
import successNotify from "./success.js";

class TeamsNotifyPlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "teams-notify", getError });
  }

  resolveConfig(pluginConfig, context) {
    return resolveConfig(pluginConfig, context);
  }

  validateConfig(config) {
    return runConfigValidators(config, [
      validateRequiredConfig("teamsWebhook", "NoTeamsWebhook"),
      validateUrlConfig("teamsWebhook", "InvalidTeamsWebhook"),
      validateRequiredConfig("packageName", "NoPackageName"),
      validateRequiredConfig("githubToken", "NoGithubToken"),
    ]);
  }

  async success(pluginConfig, context) {
    return this.runOptionalHook(pluginConfig, context, successNotify, {
      verifyMessage:
        "Warning: Configuration verification failed, skipping Teams notification:",
      hookMessage:
        "Warning: Teams notification failed, but continuing with release:",
    });
  }
}

const hooks = createPluginHooks(new TeamsNotifyPlugin(), [
  "verifyConditions",
  "success",
]);

export const verifyConditions = hooks.verifyConditions;
export const success = hooks.success;

export default hooks;
