import { promises as fs } from "node:fs";
import { getContextEnv, isDebugEnabled } from "../../core/index.js";
import getConfigToUse from "./get-config-to-use.js";

async function readPackageName() {
  try {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
    return packageJson.name || "";
  } catch {
    return "";
  }
}

export default async (pluginConfig, context) => {
  const projectName = await readPackageName();
  const env = getContextEnv(context);
  const configToUse = getConfigToUse(pluginConfig, context);

  return {
    teamsWebhook:
      env.TEAMS_NOTIFICATION_URI || configToUse.teamsWebhook || false,
    githubToken: env.GH_TOKEN || env.GITHUB_TOKEN || false,
    commitSHA: env.COMMIT_SHA || false,
    packageName:
      env.SEMANTIC_RELEASE_PACKAGE ||
      env.npm_package_name ||
      configToUse.packageName ||
      projectName ||
      false,
    notificationType:
      env.TEAMS_NOTIFICATION_TYPE || configToUse.notificationType || false,
    debug: isDebugEnabled(env, "notify") || isDebugEnabled(env, "teams-notify"),
  };
};
