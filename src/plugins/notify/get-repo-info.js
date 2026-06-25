import { URL as NodeURL } from "node:url";

export default function getRepoInfo(repositoryUrl) {
  if (repositoryUrl.startsWith("git@")) {
    repositoryUrl = `ssh://${repositoryUrl}`;
  }

  const parsedUrl = new NodeURL(
    repositoryUrl.replace(
      /\.([a-z])*:/i,
      (value) => `${value.substring(0, value.length - 1)}/`,
    ),
  );
  const path = parsedUrl.pathname
    .substring(1)
    .replace(".git", "")
    .replace(":", "");
  const URL = `https://${parsedUrl.host}/${path}`;

  return { path, URL, hostname: parsedUrl.hostname };
}
