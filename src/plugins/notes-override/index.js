import {
  createPluginHooks,
  runConfigValidators,
  SemanticReleasePlugin,
  stripInternalReleaseLinks,
  validateRequiredConfig,
} from "../../core/index.js";
import resolveConfig from "./resolve-config.js";
import getError from "./get-error.js";

class NotesOverridePlugin extends SemanticReleasePlugin {
  constructor() {
    super({ namespace: "notes-override", getError });
  }

  resolveConfig(pluginConfig, context) {
    return resolveConfig(pluginConfig, context);
  }

  validateConfig(config) {
    return runConfigValidators(config, [
      validateRequiredConfig("notes", "ReleaseNotesNotFound"),
    ]);
  }

  async generateNotes(pluginConfig, context) {
    const config = await this.resolveConfig(pluginConfig, context);
    return stripInternalReleaseLinks(config.notes);
  }
}

const hooks = createPluginHooks(new NotesOverridePlugin(), [
  "verifyConditions",
  "generateNotes",
]);

export const verifyConditions = hooks.verifyConditions;
export const generateNotes = hooks.generateNotes;

export default hooks;
