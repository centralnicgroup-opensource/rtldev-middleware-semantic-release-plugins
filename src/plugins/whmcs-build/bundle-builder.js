import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execa } from "execa";
import { resolveFiles } from "./files.js";
import getError from "./get-error.js";

/**
 * Builds the release bundle: composer update, clean, copy the configured
 * files into the build directory, format the output, and zip it up.
 */
export default class BundleBuilder {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.cwd = config.cwd;
  }

  resolve(...segments) {
    return path.resolve(this.cwd, ...segments);
  }

  get archiveFilePath() {
    return this.resolve(`${this.config.archiveFileName}-latest.zip`);
  }

  async composerUpdate() {
    const { composer } = this.config;
    if (!composer) {
      return;
    }

    if (composer.script) {
      try {
        this.logger.log(`Running composer script ${composer.script}`);
        await execa(composer.script, composer.module ? [composer.module] : [], {
          cwd: this.cwd,
        });
      } catch (error) {
        // The script is an optional pre-step (e.g. swapping in a variant
        // composer file); a non-zero exit is not fatal because the
        // `composer validate` + `update` below are the actual gate.
        this.logger.log(
          `Optional composer script exited non-zero; continuing with composer validate/update: ${error.shortMessage || error.message}`,
        );
      }
    }

    this.logger.log("Validating composer configuration");
    await execa("composer", ["validate"], { cwd: this.cwd });
    this.logger.log("Running composer update --no-dev");
    await execa("composer", ["update", "--no-dev"], { cwd: this.cwd });
  }

  async clean() {
    for (const target of [
      this.resolve(this.config.archiveBuildPath),
      this.archiveFilePath,
    ]) {
      await rm(target, { recursive: true, force: true });
    }
    this.logger.log("Cleaned previous build output.");
  }

  async copyInto(sourceFile, targetFile) {
    const target = this.resolve(this.config.archiveBuildPath, targetFile);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.resolve(sourceFile), target);
  }

  async copyFiles() {
    const files = await resolveFiles(this.config.filesForArchive, {
      cwd: this.cwd,
    });

    for (const file of files) {
      const basename = path.posix.basename(file).replace(".public", "");
      const dirname = path.posix.dirname(file);
      await this.copyInto(file, path.posix.join(dirname, basename));
    }

    this.logger.log(
      `Copied ${files.length} file(s) to ${this.config.archiveBuildPath}.`,
    );
  }

  async copyMappings() {
    for (const [source, destinations] of Object.entries(
      this.config.filesForArchiveMapping,
    )) {
      const files = await resolveFiles([source], { cwd: this.cwd });
      for (const destination of destinations) {
        for (const file of files) {
          await this.copyInto(
            file,
            path.posix.join(destination, path.posix.basename(file)),
          );
        }
      }
    }
  }

  async formatWithPrettier() {
    if (!this.config.prettier) {
      return;
    }

    let prettier;
    try {
      prettier = await import("prettier");
    } catch {
      throw getError("PrettierMissing");
    }

    const files = await resolveFiles(this.config.prettier.files, {
      cwd: this.cwd,
    });

    let formatted = 0;
    for (const file of files) {
      const filePath = this.resolve(file);
      const info = await prettier.getFileInfo(filePath);
      if (info.ignored || !info.inferredParser) {
        continue;
      }

      const source = await readFile(filePath, "utf8");
      const options = (await prettier.resolveConfig(filePath)) || {};
      const output = await prettier.format(source, {
        ...options,
        filepath: filePath,
      });

      if (output !== source) {
        await writeFile(filePath, output);
        formatted += 1;
      }
    }

    this.logger.log(`Formatted ${formatted} file(s) in the build output.`);
  }

  async buildArchive() {
    if (!this.config.archive) {
      return;
    }

    const { ZipArchive } = await import("archiver");
    const archive = new ZipArchive();
    const archiveWriteStream = createWriteStream(this.archiveFilePath);

    archive.on("warning", (error) => {
      if (error.code === "ENOENT") {
        this.logger.log(`Archive warning: ${error.message}`);
        return;
      }
      archive.destroy(error);
    });

    const archivePipeline = pipeline(archive, archiveWriteStream);
    archive.glob("**/*", {
      cwd: this.resolve(this.config.archiveBuildPath),
      ignore: [`**/${this.config.archiveFileName}.zip`],
      dot: true,
    });

    await Promise.all([archive.finalize(), archivePipeline]);
    this.logger.log(`Archive generated: ${this.archiveFilePath}`);
  }
}
