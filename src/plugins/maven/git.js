import execa from "execa";

export async function add(files, options) {
  if (files.length === 0) {
    return;
  }

  await execa("git", ["add", ...files], options);
}

export async function commit(message, options) {
  await execa("git", ["commit", "-m", message], options);
}

export async function push(repositoryUrl, branchName, options) {
  await execa("git", ["push", repositoryUrl, `HEAD:${branchName}`], options);
}
