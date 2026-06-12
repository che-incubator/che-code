---
name: validate-rebase-rules
description: Validates that .rebase/ rules (replace, add, override) are still current against upstream VS Code. Generates a rebase-rules-validation.md report with mismatches and proposed fixes. Use when asked to check, validate, or audit rebase rules, or before a rebase.
---

# Validate Rebase Rules

Check whether `.rebase/` rules are still applicable to the current upstream VS Code version and the current che-code branch. Produce a `rebase-rules-validation.md` report listing any problems found.

## Prerequisites

Ensure the `upstream-code` remote exists and is fetched:

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

## Step 1 — Resolve versions from rebase.sh

Read `rebase.sh` and extract two variables:

- `CURRENT_UPSTREAM_VERSION` — e.g. `release/1.108`
- `PREVIOUS_UPSTREAM_VERSION` — e.g. `release/1.104`

These are defined near the top of `rebase.sh` as shell variable assignments.

Use the upstream git ref `upstream-code/<version>` when fetching file content:

```bash
git show upstream-code/<version>:<path>
```

Where `<path>` is **without** the `code/` prefix (upstream stores VS Code sources at repo root).

## Step 2 — Validate `.rebase/replace/` rules

Each file under `.rebase/replace/` has the form `.rebase/replace/<code-path>.json` and contains a JSON array of `{ "from": "...", "by": "..." }` objects.

**Path mapping:**

| Context | Path |
|---------|------|
| Rule file | `.rebase/replace/<code-path>.json` |
| Upstream file | `<code-path>` with leading `code/` stripped → use as path in `git show upstream-code/CURRENT_UPSTREAM_VERSION:<stripped-path>` |
| che-code file | `<code-path>` in the current working tree |

**For each rule entry:**

1. **Check `from` in upstream.** Fetch the upstream file at `CURRENT_UPSTREAM_VERSION`. Verify the `from` string exists verbatim in that file content. Handle escape sequences in the JSON: `\n` → newline, `\t` → tab, `\\` → backslash. The actual file content must contain the **decoded** string.

2. **Check `by` in che-code.** Read the che-code file from the current working tree. Verify the decoded `by` string exists in it. Again, decode JSON escapes before matching.

3. **On mismatch — propose a fix.**
   - Fetch the same file at `PREVIOUS_UPSTREAM_VERSION`.
   - Compare the `PREVIOUS_UPSTREAM_VERSION` content with the `CURRENT_UPSTREAM_VERSION` content around the area where `from` was expected.
   - Identify what changed and propose the corrected `from` or `by` value.

**Important note on escape handling in replace rules:**
The replace rules use a custom escaping convention (not standard JSON escapes). For example `\\\n` means literal newline, `\\\t` means literal tab. When reading the JSON with `jq -r`, these are automatically decoded to actual newline/tab characters. Always use `jq -r '.from'` and `jq -r '.by'` to get the real strings for comparison.

## Step 3 — Validate `.rebase/add/` rules

Files under `.rebase/add/` are JSON fragments that get **merged into** upstream files using jq: `jq -s '.[1] * .[0]' <add-file> <upstream-file>` — the add-rule values take priority for conflicting keys. By convention, add rules are intended for keys absent in upstream, so conflicts should not occur.

### 3a — Check upstream for conflicts

The purpose of `add` rules is to add keys that **do not exist** in upstream. If a key now exists in upstream, the rule may be redundant or causing a silent override.

**For each file in `.rebase/add/`:**

1. Identify the upstream file path (strip `code/` prefix).
2. Read the add rule JSON.
3. Fetch the upstream file at `CURRENT_UPSTREAM_VERSION`.
4. For every leaf key/value in the add rule, check if that key exists in the upstream file:
   - **Key absent in upstream** → OK, the add rule is still needed.
   - **Key exists with the same value** → WARNING: add rule is redundant, upstream already has this value. Consider removing it.
   - **Key exists with a different value** → WARNING: the add rule silently overrides the upstream value. This is a potential conflict.
     - For version-like values (semver): if upstream version ≥ add-rule version → the add rule may be downgrading. Report as WARNING.
     - For non-version values: report the upstream value vs add-rule value for manual review.

### 3b — Check che-code for correct application

Verify that the add rule values are actually present in the current che-code working tree.

**For each file in `.rebase/add/`:**

1. Identify the corresponding che-code file (same path, e.g. `.rebase/add/code/package.json` → `code/package.json`).
2. Read the che-code file from the working tree.
3. Read the add rule JSON.
4. For every leaf key/value in the add rule, verify it is present in the che-code file:
   - For flat key-value pairs, check exact key and value presence.
   - For nested objects (e.g. `dependencies`, `devDependencies`, `overrides`), check that each leaf key-value from the add rule appears in the corresponding section of the che-code file.
5. If a value from the add rule is **not** found in the che-code file, report it as ERROR: rule was not applied or was overwritten.

**Note:** For `product.json` add rules, check nested arrays and objects similarly — verify each element/key is present.

## Step 4 — Validate `.rebase/override/` rules

Files under `.rebase/override/` are JSON fragments merged **over** upstream files using jq: `jq -s '.[0] * .[1]' <upstream-file> <override-file>` — override values take priority.

**For each file in `.rebase/override/`:**

1. Identify the upstream file path (strip `code/` prefix).
2. Read the override rule JSON.
3. Fetch the upstream file at `CURRENT_UPSTREAM_VERSION`.
4. For every leaf key in the override rule:
   a. **Check key still exists in upstream.** If the key no longer exists in the upstream file at `CURRENT_UPSTREAM_VERSION`, report a warning: the override may be unnecessary or the upstream structure changed.
   b. **For version-like values (semver patterns like `^X.Y.Z`):** Compare the upstream value with the override value. Use semver logic:
      - If upstream version ≥ override version → report a warning (override may no longer be needed because upstream already meets or exceeds the required version).
      - If upstream version < override version → OK, override is still needed.
   c. **For non-version values:** If the upstream value already equals the override value, report a warning (override is redundant).

**Semver comparison guidance:**
Strip leading `^`, `~`, `>=` etc. before comparing. Compare major.minor.patch numerically. For example, `^5.1.9` override vs `^5.1.0` upstream → upstream `5.1.0 < 5.1.9` → OK. But `^5.1.9` override vs `^5.2.0` upstream → upstream `5.2.0 > 5.1.9` → warn.

## Step 5 — Generate the report

Create `rebase-rules-validation.md` in the repository root. Only create this file if there are findings to report. If all rules are valid, inform the user and do not create the file.

### Report format

```markdown
# Rebase Rules Validation Report

> Generated against upstream `<CURRENT_UPSTREAM_VERSION>` (previous: `<PREVIOUS_UPSTREAM_VERSION>`)

## Critical findings

<!-- Numbered list of the most important actionable items, e.g.: -->
1. **Short description** — Why it matters and what to do.
2. ...

---

## Replace Rules

| Rule file | Problematic value | Proposed fix |
|-----------|-------------------|--------------|
| `.rebase/replace/code/src/server-main.js.json` | `"from": "const product = ..."` not found in upstream | `"from": "const product = <new value>"` |

## Add Rules

| Rule file | Issue |
|-----------|-------|
| `.rebase/add/code/package.json` | Key `dependencies.ws` with value `8.2.3` not found in `code/package.json` |

## Override Rules

| Rule file | Key | Issue |
|-----------|-----|-------|
| `.rebase/override/code/extensions/npm/package.json` | `dependencies.minimatch` | Upstream already at `^5.2.0` which is ≥ override `^5.1.9` — override may be unnecessary |

## Uncovered Che-specific Changes

| File | Lines | Description |
|------|-------|-------------|
| `code/src/vs/.../file.ts` | 173-177 | **ERROR** — Che-specific code block not covered by any rule (will be lost during rebase) |
```

### Severity indicators

Use these prefixes in the Issue/Proposed fix column:

- **ERROR** — `from` or `by` value not found; rule will fail during rebase
- **ERROR** — Uncovered Che-specific change; code will be lost during rebase
- **WARNING** — override may be unnecessary or redundant
- **INFO** — value changed but rule still works

## Workflow summary

1. Fetch upstream remote.
2. Extract versions from `rebase.sh`.
3. Enumerate all files under `.rebase/replace/`, `.rebase/add/`, `.rebase/override/`.
4. For each rule, perform the checks described above.
5. For each file with replace rules (where rules are error-free), simulate full rule application and diff against che-code to detect uncovered Che-specific changes.
6. Collect all findings.
7. Generate `rebase-rules-validation.md` if there are findings. Otherwise report success.

## Parallelization guidance

When checking rules, launch parallel subagents or batch operations where possible:

- All `.rebase/replace/` rule files can be checked independently.
- All `.rebase/add/` rule files can be checked independently.
- All `.rebase/override/` rule files can be checked independently.
- Upstream file fetches (`git show`) can be batched.

## Missing file handling

Apply these rules across all steps when a target file cannot be found:

| File missing | Behavior |
|--------------|----------|
| **Upstream file not found** (`git show` fails) | Report as ERROR: the file was likely removed or renamed in VS Code. The entire rule file is suspect and should be reviewed. |
| **Che-code file not found** in working tree | Report as ERROR: the file is missing. The rule targets a file that does not exist in che-code. |

## Step 6 — Detect uncovered Che-specific changes

This step catches Che-specific code that exists in the working tree but has **no corresponding rebase rule** — changes that would be silently lost during rebase.

### Why this matters

During rebase, `rebase.sh` resets each conflicting file to the upstream version (`git checkout --theirs`) and then applies rules. Any Che-specific modification not covered by a rule is silently discarded.

### How to check

For each file that has a `.rebase/replace/` rule:

1. **Get the upstream file** at `CURRENT_UPSTREAM_VERSION`.
2. **Apply all rules** from the rule JSON to the upstream content, simulating what `rebase.sh` does:
   - For sed-based files: apply each `from`→`by` replacement sequentially using the sed encoding pipeline.
   - For perl-based files: apply each `from`→`by` replacement sequentially using the perl pipeline.
   - For files with custom functions in `rebase.sh` (e.g. inline perl replacements not in the JSON): also simulate those replacements.
3. **Diff the result** against the che-code working tree file.
4. **Analyze the diff:**
   - If the diff is empty → all Che changes are covered. OK.
   - If the diff shows remaining differences → those are Che-specific changes with no rule. Report as **ERROR**: "Uncovered Che-specific change — will be lost during rebase".
   - Include the diff context (line numbers, snippet) in the report so the user knows what's missing.

### What to skip

- Files where existing rules already have errors (stale `from`/`by`). The diff would be unreliable — the rule errors should be fixed first.
- Files under `code/extensions/che-*/**` (Che-owned extensions are not reset during rebase).
- Changes that come from `.rebase/add/` or `.rebase/override/` rules for JSON files — those are handled separately.

### Report format

Add a new section to the report:

```markdown
## Uncovered Che-specific Changes

| File | Lines | Description |
|------|-------|-------------|
| `code/src/vs/.../file.ts` | 173-177 | **ERROR** — Che-specific code block not covered by any rule (will be lost during rebase) |
```

### Custom functions in `rebase.sh`

Some files have custom handler functions in `rebase.sh` that apply replacements beyond what's in the JSON rule file (e.g. inline perl replacements). When simulating rules, also check `rebase.sh` for:
- Custom `apply_code_*_changes()` functions for the file
- Inline `perl` or `sed` commands within those functions
- Include those replacements in the simulation

## Additional checks for replace rules

### Unescaped `&` in sed `by` values

For rules routed through `apply_changes` (sed-based handler), check each `by` value for unescaped `&` characters. In sed replacement strings, `&` means "the entire matched text", so a literal `&` in the target output must be escaped as `\&` (which is `\\&` in JSON).

**How to detect:** Read the raw JSON `by` value (without `jq -r` decoding). If the handler is sed-based and the `by` contains `&` that is not preceded by `\`, report it as **ERROR**: unescaped `&` will produce the matched `from` text instead of a literal `&`.

**Example:** A `by` value containing `&&` will produce `<from-text><from-text>` instead of `&&`. The correct encoding is `\\&\\&`.

To determine if a rule uses sed: check `rebase.sh`'s `resolve_conflicts()` if/elif chain for the file. If the file is routed to `apply_changes` (which calls `apply_replace`, which uses `sed`), the sed encoding rules apply. If routed to `apply_changes_multi_line` or `apply_multi_line_replace` (perl-based), `&` has no special meaning and needs no escaping. For files not explicitly in the elif chain, check if the `.rebase/replace/` rule JSON contains multiline values (`\n` or `\t`): if yes, the handler will use perl; if no, it will use sed.

## Edge cases

- Some replace rules use multiline `from`/`by` values with `\\\n` and `\\\t` escapes. Always decode before matching.
- `code/package.json` can have both replace, add, and override rules simultaneously. Check each independently.
- `product.json` uses tab indentation (see `override_json_file` call with `"tab"` parameter in `rebase.sh`).

## Version pinning policy

See `.claude/skills/dependency-rebase-rules/SKILL.md` for full dependency handling guidelines. Key points:

- **Do NOT change any dependency version without asking the user.** Pins exist for CVE fixes or compatibility.
- Run the dependency pin audit (described in the dependency skill) to classify each pin as ACTIVE, REDUNDANT, or OUTDATED against the target upstream.
- Report REDUNDANT and OUTDATED pins as findings, but do not auto-remove. Present to the user for confirmation.
- If an add-rule override conflicts with an upstream direct dependency (npm EOVERRIDE), report it as a **conflict requiring user review**.

## Upstream file protection policy

**NEVER recommend editing vanilla VS Code files** to fix build or type errors. If a compilation error occurs in a file that exists identically in upstream VS Code, upstream compiles successfully — so the error has a deeper root cause in our fork's build environment. Common causes:

- A Che-specific dependency version pin (in `.rebase/add/` or `.rebase/override/`) that overrides a version upstream code depends on (e.g. pinning `@types/ws` to an old version while upstream code uses newer API).
- A rebase rule that incorrectly strips a needed import or symbol from a modified file.

When the validation report or build errors point to upstream files, flag them as **requiring deeper investigation** — not as files to patch. Needing to edit a non-Che-specific file is a strong signal that the root cause lies elsewhere (dependency pins, rebase rules, or build configuration).
