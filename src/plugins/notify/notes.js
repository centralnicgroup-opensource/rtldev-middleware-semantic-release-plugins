import { safeDecodeURIComponent } from "../../core/index.js";
import args from "./arguments.js";

export function getNotes(notes = null) {
  let cleanedNotes = safeDecodeURIComponent(notes ?? args?.notes ?? "");
  const regex = /\*\*([^:]+):\*\* (.*) \(\[([a-f0-9]{7})\]\(.*?\)\)/g;
  const result = cleanedNotes.match(regex);

  if (result?.length) {
    cleanedNotes = "";
    result.forEach((item) => {
      cleanedNotes += `${item.replace(/\(\[([a-f0-9]{7})\]\(.*?\)\)/, "").trim()}\n\n`;
    });
  }

  return `Changelog:\n\n${cleanedNotes}`;
}

export function getReleaseDate(notes = null) {
  const cleanedNotes = safeDecodeURIComponent(notes ?? args?.notes ?? "");
  const result = cleanedNotes.match(/\(\d{4}-\d{2}-\d{2}\)/);

  return result?.length ? `(${result[0].replace(/\(|\)/g, "")})` : "";
}

export function getArguments(repoUrl, release = null) {
  const releaseTypeByArg = {
    minor: ["Feature Release:", "accent"],
    major: ["Major Release:", "good"],
  };
  const [releaseType, headerColor] = releaseTypeByArg[
    release?.type ?? args?.type
  ] || ["Patch Release:", "attention"];
  const versionNumber =
    release?.version ?? args?.update ?? "Development Changes";
  const hasModule = args?.module ?? "";
  const releaseUrl =
    !/tpp|ibs/i.test(hasModule) && /\d+\.\d+\.\d+/.test(versionNumber)
      ? `${repoUrl}/releases/tag/v${versionNumber}`
      : "";
  const repoImg = /whmcs-src|blesta/i.test(repoUrl)
    ? `https://github.com/centralnicgroup-opensource/rtldev-middleware-gulp-release-notification-plugin/blob/main/assets/${repoUrl.split("/").slice(-1)}.png?raw=true`
    : "";

  return { versionNumber, releaseType, releaseUrl, headerColor, repoImg };
}
