import { getContextEnv, isDebugEnabled } from "../../core/index.js";

export default (pluginConfig = {}, context = {}) => {
  const env = getContextEnv(context);

  return {
    notes: pluginConfig.notes || env.customReleaseNotes || false,
    debug: isDebugEnabled(env, "notes-override"),
  };
};
