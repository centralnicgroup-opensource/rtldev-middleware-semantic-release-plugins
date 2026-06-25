import SemanticReleaseError from "@semantic-release/error";

export default async function postMessage(message, logger, teamsWebhook) {
  let bodyText;
  let attempts = 0;

  while (attempts < 3) {
    try {
      const response = await fetch(teamsWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      bodyText = await response.text();

      if (response.ok && bodyText === "1") {
        return bodyText;
      }

      logger.log(`JSON message format invalid: ${bodyText}`);
    } catch (error) {
      logger.log(`Attempt ${attempts + 1} failed: ${error.message}`);
    }

    attempts += 1;
    if (attempts < 3) {
      logger.log("Waiting 5 seconds to retry publishing the notification.");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new SemanticReleaseError(
    bodyText || "Failed to send message after 3 attempts",
    "FETCH_ERROR",
  );
}
