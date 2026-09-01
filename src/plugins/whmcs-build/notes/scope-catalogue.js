import { readFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";

/**
 * The commit-scope vocabulary of a repository: which scope means which product,
 * what that product is called in the notes, and who the change is for.
 *
 * Lookups are exact. Fuzzy-matching a scope against product directory names is
 * tempting but they collide in practice ("cnicdns" is a prefix of
 * "cnicdnsmanager"), and a near miss silently prints the wrong product in a
 * customer-facing note. Only the optional words a catalogue declares are
 * allowed to vary; anything else is reported, never guessed at.
 */
export class ScopeCatalogue {
  #index = new Map();

  #conflicts = [];

  /**
   * @param {object} file Catalogue contents: `scopes`, and optionally
   *   `optionalWords` and `acronyms` - the vocabulary that is specific to a
   *   product family, so this package stays brand neutral.
   */
  constructor({ scopes = [], optionalWords = [], acronyms = [] } = {}) {
    this.entries = scopes;
    this.optionalWords = new Set(optionalWords.map(ScopeCatalogue.normalize));
    this.acronyms = new Set(acronyms.map((word) => word.toLowerCase()));
    this.unknown = new Set();
    this.#build();
  }

  /** Reads a catalogue from JSON. Throws if the file is missing or malformed. */
  static load(file, cwd = process.cwd()) {
    return new ScopeCatalogue(
      JSON.parse(readFileSync(path.resolve(cwd, file), "utf8")),
    );
  }

  /** Lower-cases and collapses separators; dots survive ("internet.bs"). */
  static normalize(scope) {
    return String(scope || "")
      .toLowerCase()
      .replaceAll(/[_-]+/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  /** Every spelling of `scope` that leaves out some of the optional words. */
  #expand(scope) {
    const words = ScopeCatalogue.normalize(scope).split(" ").filter(Boolean);
    const optional = words
      .map((word, index) => (this.optionalWords.has(word) ? index : -1))
      .filter((index) => index !== -1);
    const variants = new Set();

    // One bit per optional word; set means "drop it".
    for (let mask = 0; mask < 2 ** optional.length; mask++) {
      const dropped = new Set(
        optional.filter((_, bit) => (mask & (1 << bit)) !== 0),
      );
      const variant = words.filter((_, index) => !dropped.has(index)).join(" ");

      if (variant) {
        variants.add(variant);
      }
    }

    return variants;
  }

  /**
   * Declared scopes and aliases win over generated optional-word variants, and
   * the first entry in file order wins a tie between two generated variants.
   * Two entries declaring the same key is a catalogue bug, collected for check().
   */
  #build() {
    const add = (key, entry, generated) => {
      const previous = this.#index.get(key);

      if (!previous || (previous.generated && !generated)) {
        this.#index.set(key, { entry, generated });
      } else if (previous.entry !== entry && !generated) {
        this.#conflicts.push({
          key,
          claimedBy: previous.entry.scope,
          alsoBy: entry.scope,
        });
      }
    };

    for (const generated of [false, true]) {
      for (const entry of this.entries) {
        for (const key of [entry.scope, ...(entry.aliases || [])]) {
          if (generated) {
            for (const variant of this.#expand(key)) {
              add(variant, entry, true);
            }
          } else {
            add(ScopeCatalogue.normalize(key), entry, false);
          }
        }
      }
    }
  }

  /** Acronym-aware title case; also used for trailer section titles. */
  titleCase(text) {
    return ScopeCatalogue.normalize(text)
      .split(" ")
      .filter(Boolean)
      .map((word) =>
        this.acronyms.has(word)
          ? word.toUpperCase()
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(" ");
  }

  /** Always returns something printable; unknown scopes are recorded. */
  resolve(scope) {
    const key = ScopeCatalogue.normalize(scope);

    if (!key) {
      return { label: "", audience: "customer", known: true };
    }

    const entry = this.#index.get(key)?.entry;

    if (!entry) {
      this.unknown.add(key);
      return { label: this.titleCase(key), audience: "customer", known: false };
    }

    return {
      scope: entry.scope,
      label: entry.label,
      audience: entry.audience || "customer",
      known: true,
    };
  }

  isKnown(scope) {
    return this.#index.has(ScopeCatalogue.normalize(scope));
  }

  canonicalScopes() {
    return this.entries.map((entry) => entry.scope);
  }

  /** The declared scopes and aliases of the entries matching `predicate`. */
  scopesWhere(predicate) {
    return this.entries
      .filter((entry) => predicate(entry))
      .flatMap((entry) => [entry.scope, ...(entry.aliases || [])]);
  }

  /**
   * Consistency checks, run by the plugin's verifyConditions and by a
   * repository's own lint command so the same rules apply in both.
   *
   * @param {object} [options]
   * @param {string} [options.cwd] Where `paths` and `coverGlob` resolve.
   * @param {string} [options.coverGlob] Directories that must each be claimed
   *   by an entry's `paths` - e.g. "modules/*\/*". Skipped when not set.
   */
  check({ cwd = process.cwd(), coverGlob } = {}) {
    const errors = this.#conflicts.map(
      ({ key, claimedBy, alsoBy }) =>
        `Scope key "${key}" is claimed by both "${claimedBy}" and "${alsoBy}".`,
    );
    const warnings = [];

    for (const entry of this.entries) {
      if (!entry.scope || !entry.label) {
        errors.push(
          `Entry ${JSON.stringify(entry)} needs a scope and a label.`,
        );
        continue;
      }

      if (
        entry.audience &&
        !["customer", "internal"].includes(entry.audience)
      ) {
        errors.push(
          `Scope "${entry.scope}" has audience "${entry.audience}"; expected customer or internal.`,
        );
      }

      if (ScopeCatalogue.normalize(entry.scope) !== entry.scope) {
        warnings.push(
          `Scope "${entry.scope}" is not in canonical form ("${ScopeCatalogue.normalize(entry.scope)}").`,
        );
      }
    }

    const claimed = new Set(this.entries.flatMap((entry) => entry.paths || []));

    for (const claimedPath of claimed) {
      if (globSync(claimedPath, { cwd }).length === 0) {
        errors.push(
          `The scope catalogue points at missing path ${claimedPath}.`,
        );
      }
    }

    for (const covered of coverGlob ? globSync(coverGlob, { cwd }) : []) {
      if (!claimed.has(covered)) {
        errors.push(
          `${covered} has no entry in the scope catalogue - its commits would render under a guessed name.`,
        );
      }
    }

    return { errors, warnings };
  }
}
