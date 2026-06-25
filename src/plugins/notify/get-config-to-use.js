import micromatch from "micromatch";

export default function getConfigToUse(pluginConfig = {}, context = {}) {
  const branchName = context.branch?.name || "";
  const { branchesConfig = [], ...globalPluginConfig } = pluginConfig;
  const { pattern, ...branchConfig } =
    branchesConfig.find(({ pattern }) =>
      micromatch.isMatch(branchName, pattern),
    ) || {};

  return { ...globalPluginConfig, ...branchConfig };
}
