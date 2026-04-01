---
name: add-rebase-rules
description: Generates .rebase add/override/replace rules from a commit that changes code/ files, updates rebase.sh conflict routing, and appends .rebase/CHANGELOG.md. Use when asked to add rebasing rules for a commit or PR.
argument-hint: [commit-sha]
disable-model-invocation: true
---

# Add Rebase Rules

Create or update rebasing rules for Che-specific changes that touch VS Code subtree files under `code/`.

Use this skill when the user gives a commit SHA (or PR/commit URL) and asks to add rebasing rules.

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

## Workflow

1. Resolve the target commit and collect changed files
   - If input is a URL, extract the SHA.
   - Get changed files:
     - `git show --name-only --pretty='' <sha> | sort -u`
   - Filter to the rule candidate set:
     - include: files starting with `code/`
     - exclude: `code/extensions/che-*/**`
     - exclude: `**/package-lock.json`

2. Classify each candidate file
   - `*/package.json` -> JSON merge rule (`.rebase/add/` and/or `.rebase/override/`)
   - Other modified upstream files -> replace rule (`.rebase/replace/<path>.json`)
   - Newly added Che-only files with no upstream counterpart -> skip (no rule needed)

3. Create or update JSON merge rules for `package.json`
   - Preserve only minimal changed subtree (do not copy entire package.json).
   - Use:
     - `.rebase/add/<path>` for new keys or additive nested values
     - `.rebase/override/<path>` when overriding existing values must be explicit
   - It is valid to use both for one file.
   - Keep file formatting consistent with existing `.rebase` JSON style (2-space indentation).

4. Create or update replace rules for non-JSON files
   - File path: `.rebase/replace/<original-path>.json`
   - Format: JSON array of objects with `from` and `by`.
   - Add one rule per changed hunk, using stable and unique snippets.
   - Prefer the smallest safe snippet that is unlikely to change accidentally.
   - If replacement is multiline, encode using escaped newlines/tabs in JSON consistently with existing files.
   - For multiline `from` snippets, start at the first non-whitespace token (avoid anchoring on leading indentation only).
   - Prefer replacing the whole logical block (`if (...) { ... }`) rather than only an inner line fragment, so closing braces remain structurally correct.

5. Update `rebase.sh` conflict routing
   - Ensure each file that now has a new rebasing rule is routable in `resolve_conflicts`.
   - For `package.json` files:
     - add `elif` branch calling `apply_package_changes_by_path "$conflictingFile"` (or equivalent existing pattern).
   - For non-JSON replace rules:
     - use `apply_changes "$conflictingFile"` for line-based replacements.
     - use `apply_changes_multi_line "$conflictingFile"` when multiline replacement is required.
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
   - `bash -n rebase.sh`
   - JSON validation for changed `.rebase/**/*.json` files (`jq empty <file>`)
   - For each changed `.rebase/replace/**/*.json`, verify every `from` exists in the upstream file content before finishing.
     - Example: `git show <upstream-ref>:<path-without-code-prefix>` and compare with the `from` snippet.
     - `path-without-code-prefix` means the same file path but without the leading `code/` (because `upstream-code` stores VS Code sources at repo root).
   - Dry-run the generated rule using the same replacement path as `rebase.sh` (Perl-based multiline replace), not a language-native `.replace(...)`.
   - Include at least one test case where `from`/`by` contains `$` (for example template literals like `${key}`) and confirm replacement still succeeds.
   - Re-check exclusions:
     - no rules for `code/extensions/che-*`
     - no rules for `package-lock.json`
   - Ensure every changed rule file is actually referenced by logic in `rebase.sh` when required.

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
