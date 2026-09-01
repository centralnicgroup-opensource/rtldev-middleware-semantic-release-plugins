import createDebug from "./debug.js";
import { withSession } from "./session.js";
import {
  clickAndWaitForResult,
  readAlertText,
  waitForEnabled,
  waitForSubmitResult,
} from "./page-utils.js";

const CHECKBOX_SELECTOR = 'input[name="versionIds[]"]';
const SUBMIT_SELECTOR = 'div#compatibility button[type="submit"]';

/**
 * Decides whether a WHMCS version checkbox should be ticked, from the class
 * name the Marketplace puts on it (`<major>_<minor>-…`) and the configured
 * minimum version. Only major and minor are compared, and an exact match
 * counts as compatible.
 */
export function shouldCheckVersion(className, minVersion) {
  const versionParts = String(className).split("-")[0].split("_");
  const minParts = String(minVersion).split(".");

  for (let index = 0; index < 2; index += 1) {
    const version = Number.parseInt(versionParts[index], 10) || 0;
    const minimum = Number.parseInt(minParts[index], 10) || 0;

    if (version > minimum) {
      return true;
    }

    if (version < minimum) {
      return false;
    }
  }

  return true;
}

/**
 * Ticks the compatible WHMCS versions on an already authenticated session.
 * Kept separate from the operation below so a publish can reuse its own
 * session instead of logging in a second time.
 */
export async function applyCompatibleVersions(session) {
  const { page, config, debug } = session;
  const url = session.productUrl("/edit#compatibility");

  await session.goto(url);
  debug("product page loaded at %s", url);

  await page.waitForSelector(CHECKBOX_SELECTOR, session.selectorOptions);
  await page.waitForSelector(SUBMIT_SELECTOR, session.selectorOptions);
  debug("compatibility version table found");
  debug("minimum required WHMCS version: %s", config.minVersion);

  // Read the class names out of the page and decide in Node, so the
  // comparison stays a plain testable function instead of a browser closure.
  const classNames = await page.$$eval(CHECKBOX_SELECTOR, (boxes) =>
    boxes.map((box) => box.className),
  );
  const checked = classNames.map((className) =>
    shouldCheckVersion(className, config.minVersion),
  );
  debug(
    "ticking %d of %d WHMCS versions",
    checked.filter(Boolean).length,
    checked.length,
  );

  await page.$$eval(
    CHECKBOX_SELECTOR,
    (boxes, values) => {
      boxes.forEach((box, index) => {
        box.checked = values[index];
      });
    },
    checked,
  );

  await waitForEnabled(page, SUBMIT_SELECTOR, config.timeouts.selector);
  await clickAndWaitForResult(page, SUBMIT_SELECTOR, {
    timeout: config.timeouts.goto,
    waitAfter: config.timeouts.settle,
  });

  const result = await waitForSubmitResult(page, {
    timeout: config.timeouts.goto,
  });

  if (result === "success") {
    debug("compatibility update succeeded");
    return {
      name: "WHMCS Marketplace Compatibility Update",
      url,
    };
  }

  session.report(
    result === "error"
      ? `the compatibility update was rejected: "${(await readAlertText(page)) || "no message given"}"`
      : "the compatibility update got no answer from the form",
  );
  return false;
}

/**
 * Standalone operation: log in and update the product's compatible WHMCS
 * versions.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);

  try {
    return await withSession(config, context, applyCompatibleVersions);
  } catch (error) {
    debug("updating the compatibility list failed: %s", error.message);
    return false;
  }
};
