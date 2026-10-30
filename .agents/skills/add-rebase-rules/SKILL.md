---
name: add-rebase-rules
description: Generates .rebase add/override/replace rules from a commit that changes code/ files, updates rebase.sh conflict routing, and appends .rebase/CHANGELOG.md. Use when asked to add rebasing rules for a commit or PR. Also holds the Rule kinds reference — the single source for which mechanism fits which file and how to encode replace-rule values — referenced by the rebase and fix-rebase-rules skills.
argument-hint: [commit-sha]
disable-model-invocation: true
---

# Add Rebase Rules

Create or update rebasing rules for Che-specific changes that touch VS Code subtree files under `code/`.

Use this skill when the user gives a commit SHA (or PR/commit URL) and asks to add rebasing rules.

This skill also holds the **Rule kinds reference** below — the single source of truth for which rebase-rule mechanism fits which file. Other rebase skills reference it instead of restating the rules.

## Required input

- A commit SHA is expected in `$ARGUMENTS`.
- If `$ARGUMENTS` is empty, ask the user for a commit SHA before proceeding.

## Scope and exclusions

Only consider changed files under `code/`.

Never create rebasing rules for:
- `code/extensions/che-*/**`
- any `**/package-lock.json`

Important:
- A file can be under `code/` and still be Che-only (for example `code/src/.../che/...` newly created by Che). Do not create a rule for such files if they are not upstream VS Code files.
- Still create rules for the upstream file(s) that import/use those Che-only helpers.

## Rule kinds reference

Single source of truth for which rebase-rule mechanism fits which file, and how to encode values in replace rules. Other rebase skills reference this section instead of restating it — when the classification changes, change it here only.

### Which mechanism fits which file

The `elif` chain in `resolve_conflicts()` (rebase.sh) decides which handler — and therefore which mechanism — applies to a conflicted file, not the file extension.

- **Package manifests (`*/package.json`)** → JSON merge rule (`.rebase/add/` and/or `.rebase/override/`), routed through a package handler (`apply_package_changes_by_path`, or the file's dedicated handler — see routing below).
- **Other upstream files** (`.ts`, `.html`, scripts, …) → replace rule (`.rebase/replace/<path>.json`).
- **Newly added Che-only files with no upstream counterpart** → no rule; they survive rebases like any Che-added file.

Exceptions:

- A package manifest takes a **replace rule** when the change cannot be expressed by JSON merge alone — for example, **rewriting a dependency URL format** (see `.rebase/replace/code/extensions/emmet/package.json.json`, routed via `apply_changes`) or **inserting a new entry at a specific position** among existing keys.
- A JSON file that is not a package manifest is **not** routed through the generic package handler: jq's `*` merge replaces arrays wholesale, and dedicated handler logic would be bypassed (`code/product.json` → `apply_code_product_changes`, which appends `builtInExtensions` and reorders keys; `code/extensions/github-authentication/package.json` → `apply_github_auth_package_changes`, which also removes `contributes`). Such files go to their existing dedicated handler, or take a replace rule like any non-package file.

### `add` vs `override`

Both are JSON fragments applied by `override_json_file` with a jq `*` force-merge — the rule fragment wins over upstream on conflicting keys, and arrays are replaced wholesale, never merged element-wise:

- `.rebase/add/<path>` — for keys or nested values **absent in upstream** (additive content). By convention add rules target absent keys, so the force-merge never has to fire.
- `.rebase/override/<path>` — for **overriding existing upstream values**.
- Both can be used for one file; `override_json_file` applies `override/` first, then `add/`.
- For dependency version pins (CVE fixes): a dependency already present upstream → `override` in the section where it lives; an npm `overrides` key absent upstream → `add`. See `.agents/skills/dependency-rebase-rules/SKILL.md` for the full dependency-pin guidelines.
- Place each entry in the file where the value actually lives in upstream (e.g. an override for a devDependency of `code/extensions/copilot/package.json` belongs in `.rebase/override/code/extensions/copilot/package.json`, not in a sibling package).

### Conflict routing in `rebase.sh`

Every rule-covered file must be reachable from the `elif` chain in `resolve_conflicts()`:

- package manifests on the JSON merge mechanism → `apply_package_changes_by_path "$conflictingFile"` (or the file's dedicated handler if it has one),
- replace rules → `apply_changes "$conflictingFile"` (sed, single-line) or `apply_changes_multi_line` / `apply_multi_line_replace` (perl, multiline),
- before adding a branch, inspect how similar files are routed and **match the handler already used for similar files**; do not add duplicate branches.

### Encoding special characters in replace rules

`from`/`by` values do not reach the target file verbatim — each handler interprets special characters differently. Encode per the handler the file is routed to.

#### Sed encoding (`apply_changes`)

Values go through: JSON parse → `jq -r` → `escape_litteral` → sed.

| Character in target | `from` encoding | `by` encoding |
|---------------------|----------------|---------------|
| Newline | `\\\n` | `\\\n` |
| Tab | `\\\t` | `\\\t` |
| `&` | literal | `\\&` |
| `*` | `\\*` | literal |
| `$`, `[`, `]` | literal (`escape_litteral` handles) | literal |
| `"` | `\\\"` | `\\\"` |

**Common pitfall — `&` in sed `by` values:** In sed replacement strings, `&` means "the entire matched text". Writing `&&` in a `by` value produces the matched `from` text repeated twice instead of a literal `&&`. Always escape as `\\&\\&`. This applies to any `&` in `by`, not just `&&`.

#### Perl encoding (`apply_changes_multi_line` / `apply_multi_line_replace`)

Values go through: JSON parse → `jq -r` → env var → perl `\Q\E` (from) / literal (by).

| Character in target | `from` encoding | `by` encoding |
|---------------------|----------------|---------------|
| Newline | `\n` | `\n` |
| Tab | `\t` | `\t` |
| Any special char | literal | literal |

**Prefer multiline (perl) for new rules** — simpler encoding, handles all cases, no `&` pitfall.

**Key constraint:** Shell `$()` strips trailing newlines. Ensure `from`/`by` values don't end with `\n` — include following non-whitespace text as an anchor.

## Workflow

1. Resolve the target commit and collect changed files
   - If input is a URL, extract the SHA.
   - Get changed files:
     - `git show --name-only --pretty='' <sha> | sort -u`
   - Filter to the rule candidate set:
     - include: files starting with `code/`
     - exclude: `code/extensions/che-*/**`
     - exclude: `**/package-lock.json`

2. Classify each candidate file per "Which mechanism fits which file" in the Rule kinds reference above — JSON merge rule, replace rule, or no rule needed.

3. Create or update JSON merge rules for `package.json`
   - Preserve only minimal changed subtree (do not copy entire package.json).
   - Choose `.rebase/add/` vs `.rebase/override/` per "`add` vs `override`" in the Rule kinds reference.
   - Keep file formatting consistent with existing `.rebase` JSON style (2-space indentation).

4. Create or update replace rules
   - File path: `.rebase/replace/<original-path>.json`
   - Format: JSON array of objects with `from` and `by`.
   - Add one rule per changed hunk, using stable and unique snippets.
   - **Ensure `from` appears exactly once in the upstream file.** Both sed and perl handlers replace **all** occurrences — if `from` matches multiple places, all will be replaced, which is almost always wrong. Extend the snippet with more surrounding context to make it unique.
   - Prefer the smallest safe snippet that is unlikely to change accidentally, but large enough to be unique in the file.
   - For multiline `from` snippets, start at the first non-whitespace token (avoid anchoring on leading indentation only).
   - Prefer replacing the whole logical block (`if (...) { ... }`) rather than only an inner line fragment, so closing braces remain structurally correct.
   - **Encode special characters correctly** for the handler used in `rebase.sh` — see "Encoding special characters in replace rules" in the Rule kinds reference.

5. Update `rebase.sh` conflict routing
   - Ensure each file that now has a new rebasing rule is routable in `resolve_conflicts`, matching the handler already used for similar files (see "Conflict routing in `rebase.sh`" in the Rule kinds reference).
   - For multiline replacements, `rebase.sh` has **two** handlers — do not always default to one:
     - `apply_changes_multi_line "$conflictingFile"` — higher-level wrapper that resets the file (`git checkout --theirs`), calls `apply_multi_line_replace`, then stages the result (`git add`).
     - `apply_multi_line_replace "$conflictingFile"` — low-level function that performs the Perl multiline replacement directly, without git checkout/add.
   - Do not add duplicate branches.

6. Update `.rebase/CHANGELOG.md`
   - Append a new entry in existing format:
     - `#### @<author>`
     - commit/PR link (or commit SHA if no link is available)
     - list only files for which rebasing rules were added/updated
     - separator `---`

7. Validate before finishing
   - Determine the upstream ref from `rebase.sh` and use that exact ref for validation (do not hardcode a release branch in the skill output).
     - Example source of truth in `rebase.sh`: `UPSTREAM_VERSION=$(git rev-parse upstream-code/release/1.108)`
     - If the script later points to `upstream-code/main` or another release branch, use that new ref instead.
   - If the upstream-code remote doesn't exist or the needed ref isn't available, add it temporarily and/or fetch.
   - `bash -n rebase.sh`
   - JSON validation for changed `.rebase/**/*.json` files (`jq empty <file>`)
   - For each changed `.rebase/replace/**/*.json`, verify every `from` exists in the upstream file content before finishing.
     - Example: `git show <upstream-ref>:<path-without-code-prefix>` and compare with the `from` snippet.
     - `path-without-code-prefix` means the same file path but without the leading `code/` (because `upstream-code` stores VS Code sources at repo root).
   - Verify each `from` appears **exactly once** in the upstream file. If it matches multiple times, the rule will silently replace all of them. Extend the `from` snippet with more context until it is unique.
   - Dry-run the generated rule using the same replacement path as `rebase.sh` (Perl-based multiline replace), not a language-native `.replace(...)`.
   - Include at least one test case where `from`/`by` contains `$` (for example template literals like `${key}`) and confirm replacement still succeeds.
   - Re-check exclusions:
     - no rules for `code/extensions/che-*`
     - no rules for `package-lock.json`
   - Ensure every changed rule file is actually referenced by logic in `rebase.sh` when required.
   - **After validation completes, clean temporary data:** `git remote remove upstream-code 2>/dev/null; rm -f .git/shallow .git/FETCH_HEAD` to prevent git log performance degradation from shallow clone markers. However, if upstream-code existed prior, no cleanup should be performed.

8. Verify completeness — no uncovered Che-specific changes
   - For each file that was updated or created in `.rebase/replace/`, simulate the **full** rule application:
     1. Start with the upstream file at `CURRENT_UPSTREAM_VERSION`.
     2. Apply **all** rule entries from the JSON (not just the newly added ones) plus any custom inline replacements from `rebase.sh`.
     3. Diff the result against the che-code working tree file.
   - If the diff is empty → all Che changes are covered. Good.
   - If there is a remaining diff → there are Che-specific changes in the working tree that are **not covered** by any rule. These changes would be silently lost during rebase.
     - If the uncovered changes are from the same commit being processed, add additional rule entries for them.
     - If the uncovered changes are pre-existing (from earlier commits), report them to the user as a warning: "Pre-existing Che-specific changes at lines X-Y have no rebase rule and would be lost during rebase."

## Decision notes

- Goal is to protect Che-specific behavior during upstream subtree rebases while keeping deltas in upstream files minimal.
- Prefer moving larger Che logic into Che-owned files and keeping upstream file edits small; then create replace rules only for the upstream file edits.
- When unsure between `add` vs `override` for JSON, follow existing `.rebase` conventions in neighboring files and keep the smallest rule payload that reproduces the required result.

## Examples

- Dependency override updates across many `code/**/package.json` files:
  - Example commit: `04b7984047fec31dd6993bd299f6698750c63d08`
  - Matching rule-update style: `eec9cd1e9e199ce9a0eb2f6e3bd1dad6fc258413`

- Source-level VS Code file changes protected by replace rules:
  - Example PR changes: `https://github.com/che-incubator/che-code/pull/617/changes`
  - Matching rule commit: `https://github.com/che-incubator/che-code/pull/617/changes/e794c63f01d116b0b92d5ecd220247e13a5ba946`
