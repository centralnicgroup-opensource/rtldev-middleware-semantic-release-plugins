import createDebug from "./debug.js";
import { withSession } from "./session.js";
import {
  clickAndWaitForResult,
  readAlertText,
  wait,
  waitForSubmitResult,
} from "./page-utils.js";

// The confirmation the Marketplace shows after clicking Delete is not always a
// <button>: on some paths it is a link or a submit input carrying the same
// class, and on others the delete applies straight away and nothing to confirm
// ever appears. Match all three, and treat "no confirmation" as a normal
// outcome - whether the version is gone is decided further down, not here.
const CONFIRM_SELECTOR =
  "button.btn-styled-red, input.btn-styled-red, .modal a.btn-styled-red";

/** Finds the delete button in the table row of the given version. */
async function findDeleteButton(page, version) {
  for (const row of await page.$$("tr")) {
    const text = await row.evaluate((el) => el.textContent);
    if (!text.includes(`Version ${version}`)) {
      continue;
    }

    const rightCell = await row.$("td.text-right");
    if (!rightCell) {
      continue;
    }

    for (const candidate of await rightCell.$$("a.btn-styled-red")) {
      const label = await candidate.evaluate((el) =>
        el.textContent.trim().toLowerCase(),
      );
      if (label === "delete") {
        return candidate;
      }
    }
  }

  return null;
}

/** True when no table row mentions the version any more. */
async function versionIsGone(page, version) {
  for (const row of await page.$$("tr")) {
    const text = await row.evaluate((el) => el.textContent);
    if (text.includes(`Version ${version}`)) {
      return false;
    }
  }

  return true;
}

/**
 * Deletes one published version on an authenticated session.
 */
export async function removeVersion(session, version) {
  const { page, config, debug } = session;
  const url = session.productUrl("/edit#versions");

  await session.goto(url);
  debug("product page loaded at %s", url);
  await page.waitForSelector("table", session.selectorOptions);

  const deleteButton = await findDeleteButton(page, version);
  if (!deleteButton) {
    session.report(`version ${version} has no delete button in the listing`);
    return false;
  }

  if (!(await deleteButton.boundingBox())) {
    debug("the delete button is not visible in the viewport");
    return false;
  }

  await deleteButton.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(config.timeouts.settle);

  try {
    await Promise.all([
      page.waitForNavigation(session.navigationOptions),
      deleteButton.click(),
    ]);
    debug("navigation after the delete click complete");
  } catch {
    debug(
      "no navigation after the delete click, checking for the confirmation",
    );
  }

  if (await versionIsGone(page, version)) {
    debug("the version is already gone, no confirmation needed");
  } else {
    try {
      await clickAndWaitForResult(page, CONFIRM_SELECTOR, {
        timeout: config.timeouts.selector,
        waitAfter: config.timeouts.settle,
      });
    } catch (error) {
      // Waiting the full navigation timeout here used to fail the whole
      // operation with a bare selector timeout, even when the delete had
      // already applied. The checks below give a verdict either way.
      debug("no confirmation control appeared: %s", error.message);
    }

    await wait(config.timeouts.settle);
  }

  const result = await waitForSubmitResult(page, {
    timeout: config.timeouts.navigation,
  });

  if (result === "error") {
    session.report(
      `deleting version ${version} was rejected: "${(await readAlertText(page)) || "no message given"}"`,
    );
    return false;
  }

  // The listing does not always render an alert, so fall back to checking
  // that the row is actually gone.
  if (result !== "success" && !(await versionIsGone(page, version))) {
    session.report(
      `deleting version ${version} left the row in place, and the form gave no answer`,
    );
    return false;
  }

  debug("delete succeeded");
  return {
    name: "WHMCS Marketplace Product Version",
    url: session.productUrl(),
  };
}

/**
 * Deletes one published version from the product's listing. The version to
 * remove is `context.version` - the caller says which, since this is not part
 * of a release.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);
  const version = context?.version;

  if (!version?.length) {
    debug("deleting a product version failed: no version given");
    return false;
  }

  debug("deleting version %s", version);

  try {
    return await withSession(config, context, (session) =>
      removeVersion(session, version),
    );
  } catch (error) {
    debug("deleting a product version failed: %s", error.message);
    return false;
  }
};
