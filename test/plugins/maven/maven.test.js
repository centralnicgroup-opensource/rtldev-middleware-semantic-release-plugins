import assert from "node:assert/strict";
import { describe, test, mock } from "node:test";
import {
  deploy,
  testMvn,
  updateSnapshotVersion,
  updateVersion,
} from "../../../src/plugins/maven/maven.js";
import { evaluateConfig } from "../../../src/plugins/maven/plugin-config.js";

function createLogger() {
  return {
    log: mock.fn(),
    error: mock.fn(),
  };
}

function assertLoggerOk(logger, message) {
  assert.equal(logger.log.mock.callCount(), 1);
  assert.deepEqual(logger.log.mock.calls[0].arguments, [message]);
  assert.equal(logger.error.mock.callCount(), 0);
}

describe("evaluateConfig", () => {
  test("rejects settings paths with illegal characters", () => {
    assert.throws(
      () => evaluateConfig({ settingsPath: '; echo "test"', opts: "-Pdev" }),
      /Config settingsPath contains disallowed characters/,
    );
  });

  test("rejects unknown maven targets", () => {
    assert.throws(
      () => evaluateConfig({ mavenTarget: "unknown-target" }),
      /Unrecognized maven target unknown-target/,
    );
  });
});

describe("maven commands", () => {
  test("updateVersion with all options off", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await updateVersion(
      logger,
      false,
      "1.1.1",
      undefined,
      false,
      false,
      "",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "mvn",
      [
        "versions:set",
        "--batch-mode",
        "--no-transfer-progress",
        "-DgenerateBackupPoms=false",
        "-DnewVersion=1.1.1",
      ],
    ]);
    assertLoggerOk(logger, "Updating pom.xml to version 1.1.1");
  });

  test("updateVersion with all options on", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await updateVersion(
      logger,
      true,
      "1.1.2",
      "some/path",
      true,
      true,
      "-Pdev",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "./mvnw",
      [
        "versions:set",
        "--settings",
        "some/path",
        "-X",
        "--batch-mode",
        "--no-transfer-progress",
        "-DgenerateBackupPoms=false",
        "-DnewVersion=1.1.2",
        "-DprocessAllModules",
        "-Pdev",
      ],
    ]);
    assertLoggerOk(logger, "Updating pom.xml to version 1.1.2");
  });

  test("updateSnapshotVersion with all options off", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await updateSnapshotVersion(
      logger,
      false,
      undefined,
      false,
      false,
      "",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "mvn",
      [
        "versions:set",
        "--batch-mode",
        "--no-transfer-progress",
        "-DnextSnapshot=true",
        "-DgenerateBackupPoms=false",
      ],
    ]);
    assertLoggerOk(logger, "Update pom.xml to next snapshot version");
  });

  test("updateSnapshotVersion with all options on", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await updateSnapshotVersion(
      logger,
      true,
      "some/path",
      true,
      true,
      "-Pdev",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "./mvnw",
      [
        "versions:set",
        "--settings",
        "some/path",
        "-X",
        "--batch-mode",
        "--no-transfer-progress",
        "-DnextSnapshot=true",
        "-DgenerateBackupPoms=false",
        "-DprocessAllModules",
        "-Pdev",
      ],
    ]);
    assertLoggerOk(logger, "Update pom.xml to next snapshot version");
  });

  test("deploy with all options off", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await deploy(
      logger,
      false,
      "1.1.3",
      "deploy",
      undefined,
      false,
      false,
      "",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "mvn",
      ["deploy", "--batch-mode", "--no-transfer-progress", "-DskipTests"],
    ]);
    assertLoggerOk(logger, "Deploying version 1.1.3 with maven");
  });

  test("deploy with all options on", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await deploy(
      logger,
      true,
      "1.1.4",
      "deploy jib:build",
      "some/path",
      true,
      true,
      "-Pdev",
      runner,
    );

    assert.deepEqual(runner.mock.calls[0].arguments, [
      "./mvnw",
      [
        "clean",
        "deploy",
        "jib:build",
        "--settings",
        "some/path",
        "-X",
        "--batch-mode",
        "--no-transfer-progress",
        "-DskipTests",
        "-Pdev",
      ],
    ]);
    assertLoggerOk(logger, "Deploying version 1.1.4 with maven");
  });

  test("testMvn with all options off", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await testMvn(logger, false, runner);

    assert.deepEqual(runner.mock.calls[0].arguments, ["mvn", ["-v"]]);
    assertLoggerOk(logger, "Testing if mvn exists");
  });

  test("testMvn with all options on", async () => {
    const logger = createLogger();
    const runner = mock.fn(async () => {});

    await testMvn(logger, true, runner);

    assert.deepEqual(runner.mock.calls[0].arguments, ["./mvnw", ["-v"]]);
    assertLoggerOk(logger, "Testing if mvn exists");
  });
});
