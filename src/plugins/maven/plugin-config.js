import SemanticReleaseError from "@semantic-release/error";

export function evaluateConfig(config) {
  const withDefaults = Object.assign(
    {
      processAllModules: false,
      mavenTarget: "deploy",
      clean: true,
      updateSnapshotVersion: false,
      snapshotCommitMessage: "chore: setting next snapshot version [skip ci]",
      debug: false,
      mvnw: false,
      opts: "",
    },
    config,
  );

  if (
    withDefaults.settingsPath &&
    !/^[\w~./-]*$/.test(withDefaults.settingsPath)
  ) {
    throw new SemanticReleaseError(
      "Config settingsPath contains disallowed characters",
    );
  }

  const availableTargets = ["deploy", "package jib:build", "deploy jib:build"];

  if (!availableTargets.includes(withDefaults.mavenTarget)) {
    throw new SemanticReleaseError(
      `Unrecognized maven target ${withDefaults.mavenTarget}`,
    );
  }

  return withDefaults;
}
