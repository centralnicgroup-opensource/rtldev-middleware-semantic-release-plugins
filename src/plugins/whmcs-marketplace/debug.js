import { format } from "node:util";

/**
 * Debug logging for the marketplace automation. The browser flow is only
 * observable through its log, so it is verbose by design and stays behind
 * `DEBUG=semantic-release:whmcs` (or `:whmcs-marketplace`).
 */
export default function createDebug(config, context) {
  const logger = context?.logger || console;

  return (...args) => {
    if (config?.debug) {
      logger.log(`[whmcs-marketplace] ${format(...args)}`);
    }
  };
}

/**
 * Reports a failure unconditionally, for the paths that have no session to
 * report through. Marketplace operations return false rather than throwing, so
 * without this the reason would exist only in the debug log — and the debug log
 * is off in most release jobs.
 */
export function createReporter(context) {
  const logger = context?.logger || console;

  return (message) => logger.log?.(`WHMCS Marketplace: ${message}`);
}
