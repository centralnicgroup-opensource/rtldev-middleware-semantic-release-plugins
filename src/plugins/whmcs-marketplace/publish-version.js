import { stripMarkdownLinks } from "../../core/index.js";
import createDebug from "./debug.js";
import { applyCompatibleVersions } from "./compatible-versions.js";
import { withSession } from "./session.js";
import {
  clickAndWaitForResult,
  readAlertText,
  robustType,
  setDateValue,
  waitForEnabled,
  waitForSubmitResult,
} from "./page-utils.js";

const SUBMIT_SELECTOR = 'div.listing-edit-container form button[type="submit"]';

/**
 * Fills in and submits the "new version" form on an authenticated session,
 * then ticks the compatible WHMCS versions. Returns the release object, or
 * false when the listing did not accept the version.
 */
export async function submitVersion(session, { version, notes }) {
  const { page, config, debug } = session;
  const url = session.productUrl("/versions/new");

  await session.goto(url);
  debug("product page loaded at %s", url);
  await page.waitForSelector(SUBMIT_SELECTOR, session.selectorOptions);

  await robustType(page, "#version", version);
  debug("filled in the version");

  // The listing always records today's release date, and an `input[type=date]`
  // has to be set rather than typed into.
  await setDateValue(
    page,
    "#released_at",
    new Date().toISOString().slice(0, 10),
  );
  debug("filled in the release date");

  await robustType(page, "#description", notes);
  debug("filled in the description");

  await waitForEnabled(page, SUBMIT_SELECTOR, config.timeouts.selector);
  await clickAndWaitForResult(page, SUBMIT_SELECTOR, {
    timeout: config.timeouts.selector,
    waitAfter: config.timeouts.settle,
  });

  const result = await waitForSubmitResult(page, {
    timeout: config.timeouts.selector,
  });

  if (result !== "success") {
    const alert = await readAlertText(page);
    session.report(
      result === "error"
        ? `version ${version} was rejected: "${alert || "no message given"}"`
        : `version ${version} got no answer from the listing form within ${config.timeouts.selector}ms`,
    );
    await session.holdOpenForDebugging();
    return false;
  }

  debug("publishing a new product version succeeded");

  // Reuses this session rather than logging in a second time. A failure here
  // is logged and swallowed: the version itself is already published, and the
  // compatibility list is corrected by re-running `updateCompatibility`.
  if (config.setCompatibleVersions) {
    try {
      await applyCompatibleVersions(session);
    } catch (error) {
      debug("setting the compatible versions failed: %s", error.message);
    }
  }

  return {
    name: "WHMCS Marketplace Product Version",
    url: session.productUrl(),
  };
}

/**
 * Publishes the release's version, including its notes. Returns false instead
 * of throwing: a listing that lags behind must not fail a release that has
 * already been tagged and published everywhere else.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);
  const { notes, version } = context.nextRelease || {};

  if (!notes?.length || !version?.length) {
    debug("publishing a new product version failed: no version or notes given");
    return false;
  }

  debug("release version: %s", version);

  try {
    return await withSession(config, context, (session) =>
      // The Marketplace changelog field rejects markdown links.
      submitVersion(session, { version, notes: stripMarkdownLinks(notes) }),
    );
  } catch (error) {
    debug("publishing a new product version failed: %s", error.message);
    return false;
  }
};
