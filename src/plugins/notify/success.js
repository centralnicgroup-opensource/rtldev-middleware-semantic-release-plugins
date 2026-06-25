import { readFile } from "node:fs/promises";
import { getArguments, getNotes, getReleaseDate } from "./notes.js";
import { updateValues, fetchPullRequestInfo } from "./payload-utils.js";
import getRepoInfo from "./get-repo-info.js";
import postMessage from "./post-message.js";
import resolveConfig from "./resolve-config.js";

async function loadPayload(filename) {
  return JSON.parse(await readFile(new URL(filename, import.meta.url), "utf8"));
}

export default async (pluginConfig, context) => {
  const { logger, nextRelease, options } = context;
  const config = await resolveConfig(pluginConfig, context);

  logger.log("Sending teams notification on success");

  const repo = getRepoInfo(options.repositoryUrl);
  const jiraIssueLink = await fetchPullRequestInfo(repo.URL, {
    token: config.githubToken,
    commitSHA: config.commitSHA,
  });
  const { versionNumber, releaseType, releaseUrl, headerColor, repoImg } =
    getArguments(repo.URL, nextRelease);
  const messagePayload = await loadPayload(
    config.notificationType
      ? "messagecard-payload.json"
      : "default-payload.json",
  );
  const releaseNotes = nextRelease.notes;
  const customValues = [];
  const createCustomValue = (find, replace) => ({ find, replace });
  const pushCustomValue = (nameKey, titleKey) => (label, value) => {
    const key = config.notificationType ? nameKey : titleKey;
    customValues.push(createCustomValue({ [key]: label }, value));
  };
  const pushValue = pushCustomValue("name", "id");

  if (!config.notificationType) {
    pushValue("projectName", { text: config.packageName });
    pushValue("releaseInfo", {
      text: `${releaseType} v${versionNumber} ${getReleaseDate(releaseNotes)}`,
    });
    pushValue("changeLog", { text: getNotes(releaseNotes) });
    pushValue("header", { style: headerColor });
    pushValue("releaseNotes", { url: releaseUrl ?? "" });
    pushValue("githubRepository", { url: repo.URL ?? "" });
    pushValue("jiraIssue", { url: jiraIssueLink ?? "" });
    pushValue("productImage", { url: repoImg ?? "" });
  } else {
    pushValue("Project:", { value: config.packageName });
    pushValue("Release Type:", { title: releaseType, value: versionNumber });
    pushValue("Release Notes", { uri: releaseUrl ?? "" });
    pushValue("Github Repository", { uri: repo.URL ?? "" });
    pushValue("Jira Issue", { uri: jiraIssueLink ?? "" });
  }

  if (customValues.length !== 0) {
    updateValues(messagePayload, customValues);
  }

  return postMessage(messagePayload, logger, config.teamsWebhook);
};
