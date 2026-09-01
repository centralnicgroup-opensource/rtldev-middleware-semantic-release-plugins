import createDebug from "./debug.js";
import { withSession } from "./session.js";

const VERSION_SELECTOR = "div#versions tr strong";
const VERSION_LABEL_LENGTH = "Version ".length;

/**
 * Reads the versions already published for the product on an authenticated
 * session, oldest first.
 */
export async function readPublishedVersions(session) {
  const { page, debug } = session;
  const url = session.productUrl("/edit#versions");

  await session.goto(url);
  debug("product page loaded at %s", url);
  await page.waitForSelector(VERSION_SELECTOR, session.selectorOptions);
  debug("product version table found");

  const versions = await page.$$eval(
    VERSION_SELECTOR,
    (cells, offset) => cells.map((cell) => cell.innerText.substring(offset)),
    VERSION_LABEL_LENGTH,
  );

  versions.reverse();
  versions.forEach((version) =>
    debug("detected published version %s", version),
  );
  return versions;
}

/**
 * Lists the versions already published for the product. Returns false when
 * the listing could not be read.
 */
export default async (config, context) => {
  const debug = createDebug(config, context);

  try {
    return await withSession(config, context, readPublishedVersions);
  } catch (error) {
    debug("reading the published versions failed: %s", error.message);
    return false;
  }
};
