import { execSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";

const SIGNALS = ["SIGINT", "SIGHUP", "SIGTERM", "SIGQUIT", "SIGBREAK"];

function getCommandErrorOutput(error) {
  const output = [error.stderr, error.stdout]
    .map((stream) => stream?.toString().trim())
    .filter(Boolean)
    .join("\n");

  return output || error.message;
}

/**
 * IonCube encoder wrapper owning the license lifecycle: activation,
 * deactivation, and signal handling so an interrupted release (CI timeout,
 * manual cancel) never leaks a license slot on the encoder side.
 */
export default class IonCubeEncoder {
  constructor({ encoderPath, commands = [], sudo = true }, logger = console) {
    this.encoderPath = encoderPath;
    this.commands = commands;
    this.sudo = sudo;
    this.logger = logger;
    this.active = false;
    this.signalHandlers = [];
  }

  runLicenseCommand(flag) {
    const prefix = this.sudo ? "sudo " : "";
    return execSync(`${prefix}${this.encoderPath} ${flag}`).toString();
  }

  activate() {
    this.logger.log("Activating IonCube license...");
    try {
      this.runLicenseCommand("--activate");
      this.active = true;
    } catch (error) {
      const output = getCommandErrorOutput(error);
      throw new Error(`IonCube license activation failed:\n${output}`);
    }
  }

  deactivate({ force = false, allowUnlicensed = false } = {}) {
    if (!this.active && !force) {
      return;
    }

    this.logger.log("Deactivating IonCube license...");
    try {
      this.runLicenseCommand("--deactivate");
      this.active = false;
    } catch (error) {
      const output = getCommandErrorOutput(error);
      if (allowUnlicensed && /The Encoder is unlicensed\./i.test(output)) {
        this.active = false;
        this.logger.log("No active IonCube license detected.");
        return;
      }
      throw new Error(`IonCube license deactivation failed:\n${output}`);
    }
  }

  attachSignalHandlers() {
    if (this.signalHandlers.length) {
      return;
    }

    for (const signal of SIGNALS) {
      const handler = () => {
        this.logger.error(`IonCube license cleanup triggered by ${signal}.`);
        try {
          this.deactivate({ force: true, allowUnlicensed: true });
        } catch (error) {
          this.logger.error(
            `IonCube license cleanup before process exit failed: ${error.message}`,
          );
        }
        process.exit(1);
      };
      this.signalHandlers.push([signal, handler]);
      process.once(signal, handler);
    }
  }

  detachSignalHandlers() {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers = [];
  }

  /**
   * Run `work()` inside a fully-managed license window: stale licenses are
   * cleared, a fresh activation is issued, and deactivation runs whether
   * `work` succeeds or throws. Signal handlers cover the whole window.
   */
  async withLicense(work) {
    this.attachSignalHandlers();
    try {
      this.deactivate({ force: true, allowUnlicensed: true });
      this.activate();
      try {
        await work();
      } finally {
        try {
          this.deactivate();
        } catch (cleanupError) {
          this.logger.error(
            `IonCube license cleanup failed: ${cleanupError.message}`,
          );
        }
      }
    } finally {
      this.detachSignalHandlers();
    }
  }

  async encryptFiles(files, { cwd, outputDir }) {
    for (const file of files) {
      // IonCube writes to `${outputDir}/${file}` but won't create parent
      // directories, so ensure the target subdirectory exists first.
      await mkdir(path.join(cwd, outputDir, path.dirname(file)), {
        recursive: true,
      });
      for (const command of this.commands) {
        try {
          await execa(
            `${this.encoderPath} ${command} ${file} -o ${outputDir}/${file}`,
            { cwd, shell: true },
          );
        } catch (error) {
          throw new Error(
            `IonCube encoding failed for ${file}:\n${getCommandErrorOutput(error)}`,
          );
        }
      }
      this.logger.log(`OK: ENC | ${file}`);
    }
  }

  async encryptAndVerify(files, options) {
    await this.withLicense(async () => {
      await this.encryptFiles(files, options);
      await this.verifyEncrypted(files, options);
    });
  }

  hasEncodedHeader(filePath) {
    const fileDescriptor = openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(32);
      const bytesRead = readSync(fileDescriptor, buffer, 0, buffer.length, 0);
      return /^<\?php\s+\/\/ICB\d/.test(
        buffer.subarray(0, bytesRead).toString("utf8"),
      );
    } finally {
      closeSync(fileDescriptor);
    }
  }

  async verifyEncrypted(files, { cwd, outputDir }) {
    if (!files.length) {
      throw new Error(
        "IonCube encryption verification failed: no files matched the configured patterns.",
      );
    }

    const failures = files.filter((file) => {
      const encryptedFile = path.resolve(cwd, outputDir, file);
      return (
        !existsSync(encryptedFile) || !this.hasEncodedHeader(encryptedFile)
      );
    });

    if (failures.length) {
      const examples = failures.slice(0, 20).join(", ");
      const suffix =
        failures.length > 20 ? `, and ${failures.length - 20} more` : "";
      throw new Error(
        `IonCube encryption verification failed for ${examples}${suffix}.`,
      );
    }

    this.logger.log(
      `IonCube encryption verified for ${files.length} protected file(s).`,
    );
  }
}
