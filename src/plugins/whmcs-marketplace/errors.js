export function NoMarketplaceCredentials() {
  return {
    message: "No WHMCS Marketplace credentials specified.",
    details:
      "WHMCS Marketplace credentials have to be set in the `WHMCSMP_LOGIN` and `WHMCSMP_PASSWORD` environment variables in your CI environment. The account must have access to the product you publish versions for.",
  };
}

export function NoProductId() {
  return {
    message: "No WHMCS Marketplace product id specified.",
    details:
      "The product id of your listed product at the WHMCS Marketplace has to be set in the `WHMCSMP_PRODUCTID` environment variable in your CI environment. You'll find that number in the URL when visiting the product page in the WHMCS Marketplace.",
  };
}

export function InvalidProductId() {
  return {
    message: "Invalid WHMCS Marketplace product id specified.",
    details:
      "`WHMCSMP_PRODUCTID` must be a positive integer, as found in the URL of your product page in the WHMCS Marketplace.",
  };
}

export function NoGithubToken() {
  return {
    message: "No GitHub token specified.",
    details:
      "Synchronising versions reads the repository's releases from the GitHub API. Set `GH_TOKEN` (or `GITHUB_TOKEN`) in your CI environment.",
  };
}

export function NoGithubRepo() {
  return {
    message: "No GitHub repository specified.",
    details:
      "Synchronising versions needs the repository to read releases from, as `owner/repo`. Set `GH_REPO` (or `GITHUB_REPO`) in your CI environment.",
  };
}

export function PuppeteerMissing() {
  return {
    message: "The optional `puppeteer` dependency is not installed.",
    details:
      "Publishing to the WHMCS Marketplace drives a browser. Install it in the consuming project (`pnpm add -D puppeteer`).",
  };
}

export function ChromeNotFound() {
  return {
    message: "No Chrome executable was found for Puppeteer.",
    details:
      "Install a browser before the release runs (`pnpm dlx puppeteer browsers install chrome --install-deps`), or point `PUPPETEER_EXECUTABLE_PATH` at an existing Chrome binary.",
  };
}

export function CookieExtensionNotFound() {
  return {
    message: "The configured cookie-banner extension was not found.",
    details:
      "`cookieExtensionPath` does not exist on this machine. Fix the path, or disable the extension with `useCookieExtension: false`.",
  };
}

export function InvalidMarketplaceUrl() {
  return {
    message: "The `urlBase` option is not a valid URL.",
    details:
      "`urlBase` (or `WHMCSMP_URL`) must be an absolute URL such as `https://marketplace.whmcs.com`.",
  };
}
