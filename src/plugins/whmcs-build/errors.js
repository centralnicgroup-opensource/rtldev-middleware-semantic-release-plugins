export function ArchiveFileNameRequired() {
  return {
    message: "The `archiveFileName` option is required.",
    details:
      "Set `archiveFileName` in the plugin configuration, for example `whmcs-cnic-bundle`. It is used with `archiveSuffix` (default `-latest`) for the release archive name.",
  };
}

export function ComposerScriptRequired() {
  return {
    message: "The `composer.script` option is required.",
    details:
      "Composer preparation is enabled but no script is configured. Set `composer.script` to an executable build script, or disable Composer preparation with `composer: false`.",
  };
}

export function BeforeBuildCommandRequired() {
  return {
    message: "The `beforeBuild.command` option is required.",
    details:
      "A pre-build step is configured without a command. Set `beforeBuild.command` to an executable or disable the step with `beforeBuild: false`.",
  };
}

export function EncoderPathRequired() {
  return {
    message: "The `encrypt.encoderPath` option is required.",
    details:
      "Encryption is enabled but no IonCube encoder path is configured. Set `encrypt.encoderPath` to the `ioncube_encoder.sh` location, or disable encryption with `encrypt: false`.",
  };
}

export function EncoderCommandsRequired() {
  return {
    message: "The `encrypt.commands` option is required.",
    details:
      'Encryption is enabled but no encoder commands are configured. Set `encrypt.commands` to the IonCube encoder argument sets, for example `["-81 --bundle", "-82 --add-to-bundle"]`.',
  };
}

export function EncoderNotFound() {
  return {
    message: "The configured IonCube encoder was not found.",
    details:
      "The path configured in `encrypt.encoderPath` does not exist on this machine. Install the IonCube encoder or fix the configured path.",
  };
}

export function DistributionRepoUrlRequired() {
  return {
    message: "The `distributionRepo.url` option is required.",
    details:
      "Publishing to a distribution repository is enabled but no repository URL is configured. Set `distributionRepo.url`, or disable publishing with `distributionRepo: false`.",
  };
}

export function NoDistributionRepoToken() {
  return {
    message: "No GitHub token found for the distribution repository.",
    details:
      "Publishing to a distribution repository requires a GitHub personal access token. Set it in the environment variable configured via `distributionRepo.tokenEnv` (default `DISTRIBUTION_REPO_TOKEN`).",
  };
}

export function SkiaCanvasMissing() {
  return {
    message: "The optional `skia-canvas` dependency is not installed.",
    details:
      "Logo stamping (`logoStamp`) requires the `skia-canvas` package. Install it in the consuming project (`pnpm add -D skia-canvas`) or disable `logoStamp`.",
  };
}

export function PrettierMissing() {
  return {
    message: "The optional `prettier` dependency is not installed.",
    details:
      "Formatting the build output (`prettier`) requires the `prettier` package. Install it in the consuming project (`pnpm add -D prettier`) or disable the `prettier` option.",
  };
}
