import { createSemanticReleaseError } from "../../core/index.js";
import * as ERROR_DEFINITIONS from "./errors.js";

export default (code) => createSemanticReleaseError(ERROR_DEFINITIONS, code);
