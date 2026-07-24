import SemanticReleaseError from "@semantic-release/error";

export function createSemanticReleaseError(definitions, code) {
  const definition = definitions[code];

  if (!definition) {
    return new SemanticReleaseError(
      `Unknown semantic-release plugin error: ${code}`,
      code,
    );
  }

  const { message, details } = definition();
  return new SemanticReleaseError(message, code, details);
}

export function throwIfErrors(errors) {
  if (errors.length > 0) {
    throw new AggregateError(errors);
  }
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isDebugEnabled(env = process.env, namespace) {
  return Boolean(
    env.DEBUG &&
    new RegExp(`^semantic-release:(\\*|${escapeRegExp(namespace)})$`).test(
      env.DEBUG,
    ),
  );
}

export function getContextEnv(context) {
  return context?.env || process.env;
}

export function safeDecodeURIComponent(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function stripInternalReleaseLinks(value = "") {
  return safeDecodeURIComponent(value).replace(
    /\(\[([^[\]]*)\]\(([^()]*)\)\)|\[([^[\]]*)\]\(([^()]*)\)/gi,
    (_match, parentText, parentUrl, linkText, linkUrl) => {
      const url = linkUrl || parentUrl || "";
      const isCommit = /\/commit\//i.test(url);
      const isInternal =
        isCommit ||
        /\/(?:compare|issues|pull|merge_requests)\//i.test(url) ||
        /atlassian\.net/i.test(url);

      if (isCommit) {
        return "";
      }

      return isInternal ? linkText || parentText || "" : _match;
    },
  );
}

export function validateRequiredConfig(name, code = `${name}Required`) {
  return (config) =>
    config[name] === false ||
    config[name] === undefined ||
    config[name] === null ||
    config[name] === ""
      ? code
      : null;
}

export function validateUrlConfig(name, code = `${name}Invalid`) {
  return (config) => {
    if (
      config[name] === false ||
      config[name] === undefined ||
      config[name] === null ||
      config[name] === ""
    ) {
      return null;
    }

    try {
      new URL(config[name]);
      return null;
    } catch {
      return code;
    }
  };
}

export function runConfigValidators(config, validators) {
  return validators
    .flatMap((validator) => {
      const result = validator(config);
      return Array.isArray(result) ? result : [result];
    })
    .filter(Boolean);
}

function normalizeValidationResult(result, getError) {
  return (Array.isArray(result) ? result : [result])
    .filter(Boolean)
    .map((error) => {
      if (typeof error !== "string") {
        return error;
      }

      return getError ? getError(error) : new Error(error);
    });
}

export class SemanticReleasePlugin {
  constructor({ namespace, getError } = {}) {
    this.namespace = namespace;
    this.getError = getError;
    this.verified = false;
  }

  async resolveConfig() {
    return {};
  }

  async validateConfig() {
    return [];
  }

  async afterVerify() {}

  async verifyConditions(pluginConfig, context) {
    if (this.verified) {
      return;
    }

    const config = await this.resolveConfig(pluginConfig, context);
    const validationResult = await this.validateConfig(
      config,
      pluginConfig,
      context,
    );
    throwIfErrors(normalizeValidationResult(validationResult, this.getError));
    await this.afterVerify(config, pluginConfig, context);
    this.verified = true;
  }

  async ensureVerified(pluginConfig, context, { soft = false, message } = {}) {
    try {
      await this.verifyConditions(pluginConfig, context);
      return true;
    } catch (error) {
      if (!soft) {
        throw error;
      }

      context?.logger?.log?.(
        message || "Warning: Configuration verification failed, skipping hook:",
        error.message,
      );
      return false;
    }
  }

  async runOptionalHook(
    pluginConfig,
    context,
    callback,
    { verifyMessage, hookMessage } = {},
  ) {
    const canRun = await this.ensureVerified(pluginConfig, context, {
      soft: true,
      message: verifyMessage,
    });

    if (!canRun) {
      return undefined;
    }

    try {
      return await callback(pluginConfig, context);
    } catch (error) {
      context?.logger?.log?.(
        hookMessage || "Warning: Optional hook failed, continuing release:",
        error.message,
      );
      return undefined;
    }
  }
}

export function createPluginHooks(plugin, hookNames) {
  return Object.fromEntries(
    hookNames.map((hookName) => {
      if (typeof plugin[hookName] !== "function") {
        throw new TypeError(
          `Cannot expose semantic-release hook ${hookName}: plugin method is missing`,
        );
      }

      return [hookName, plugin[hookName].bind(plugin)];
    }),
  );
}
