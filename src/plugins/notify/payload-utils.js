export function updateValues(payload, customValues) {
  if (typeof payload !== "object" || payload === null) {
    return;
  }

  for (const prop in payload) {
    updateValues(payload[prop], customValues);

    const matchingFind = customValues.find(({ find }) =>
      isObjectMatch(payload[prop], find),
    );
    if (!matchingFind) {
      continue;
    }

    const { replace } = matchingFind;
    for (const replaceKey in replace) {
      if (replace[replaceKey] === "") {
        delete payload[prop];
      } else if (payload[prop][replaceKey] !== undefined) {
        payload[prop][replaceKey] = replace[replaceKey];
      } else {
        findAndReplaceNestedKey(payload[prop], replaceKey, replace[replaceKey]);
      }
    }
  }

  removeNulls(payload);
}

function findAndReplaceNestedKey(obj, targetKey, replacement) {
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      findAndReplaceNestedKey(obj[key], targetKey, replacement);
    } else if (key === targetKey) {
      obj[key] = replacement;
    }
  }
}

function isObjectMatch(obj, criteria) {
  return Object.entries(criteria).every(
    ([key, value]) =>
      obj &&
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] === value,
  );
}

export async function fetchPullRequestInfo(repoUrl, { token, commitSHA } = {}) {
  const usernameAndRepo = repoUrl.split("/").slice(-2).join("/");

  if (!token || !commitSHA || !usernameAndRepo) {
    return undefined;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${usernameAndRepo}/commits/${commitSHA}/pulls`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const result = (await response.json())[0];

    if (result?.title || result?.head?.ref) {
      const jiraID =
        result?.title.match(/(RSRMID|GI)-\d+/g) ||
        result?.head?.ref.match(/(RSRMID|GI)-\d+/g);
      return jiraID ? `https://centralnic.atlassian.net/browse/${jiraID}` : "";
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function removeNulls(obj) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.filter((item) => item !== null);
    }

    for (const key in obj) {
      if (obj[key] === null) {
        delete obj[key];
      } else {
        obj[key] = removeNulls(obj[key]);
      }
    }
  }

  return obj;
}
