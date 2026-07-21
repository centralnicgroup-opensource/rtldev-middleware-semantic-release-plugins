import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import IonCubeEncoder from "../../../src/plugins/whmcs-build/ioncube-encoder.js";

const logger = { log() {}, error() {} };

const STUB_ENCODER = `#!/bin/sh
if [ "$1" = "--activate" ] || [ "$1" = "--deactivate" ]; then
  exit 0
fi
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
# No mkdir here on purpose: the real ioncube encoder does not create parent
# directories, so encryptFiles() must - this stub stays faithful to that.
printf '<?php //ICB1\\nencoded' > "$out"
`;

describe("whmcs-build IonCubeEncoder", () => {
  let fixtureDir;
  let encoderPath;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "whmcs-build-encoder-"));
    encoderPath = path.join(fixtureDir, "ioncube_encoder.sh");
    await writeFile(encoderPath, STUB_ENCODER);
    await chmod(encoderPath, 0o755);
    await mkdir(path.join(fixtureDir, "modules"), { recursive: true });
    await writeFile(path.join(fixtureDir, "modules/cnic.php"), "<?php echo 1;");
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  function createEncoder() {
    return new IonCubeEncoder(
      { encoderPath, commands: ["-81 --bundle"], sudo: false },
      logger,
    );
  }

  test("encrypts and verifies files inside a license window", async () => {
    const encoder = createEncoder();
    const files = ["modules/cnic.php"];

    await encoder.withLicense(async () => {
      await encoder.encryptFiles(files, {
        cwd: fixtureDir,
        outputDir: "build",
      });
      await encoder.verifyEncrypted(files, {
        cwd: fixtureDir,
        outputDir: "build",
      });
    });

    assert.equal(encoder.active, false);
    assert.equal(encoder.signalHandlers.length, 0);
    assert.ok(
      encoder.hasEncodedHeader(path.join(fixtureDir, "build/modules/cnic.php")),
    );
  });

  test("hasEncodedHeader rejects plain PHP files", async () => {
    const encoder = createEncoder();
    assert.equal(
      encoder.hasEncodedHeader(path.join(fixtureDir, "modules/cnic.php")),
      false,
    );
  });

  test("verifyEncrypted fails when output files are missing", async () => {
    const encoder = createEncoder();
    await assert.rejects(
      encoder.verifyEncrypted(["modules/cnic.php"], {
        cwd: fixtureDir,
        outputDir: "build",
      }),
      /IonCube encryption verification failed for modules\/cnic\.php/,
    );
  });

  test("verifyEncrypted fails without matched files", async () => {
    const encoder = createEncoder();
    await assert.rejects(
      encoder.verifyEncrypted([], { cwd: fixtureDir, outputDir: "build" }),
      /no files matched/,
    );
  });

  test("license deactivation still runs when work throws", async () => {
    const encoder = createEncoder();
    await assert.rejects(
      encoder.withLicense(async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(encoder.active, false);
    assert.equal(encoder.signalHandlers.length, 0);
  });
});
