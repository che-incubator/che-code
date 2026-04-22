---
name: fix-rebase-rules
description: Fixes broken .rebase/replace/ rules identified by the validation report or for a single file. Reads rebase-rules-validation.md (produced by validate-rebase-rules) and repairs ERROR-level replace rule problems. Use when asked to fix rebase rules after validation, or to fix rules for a specific file.
---

# Fix Rebase Rules

Repair broken `.rebase/replace/` rule files and their `rebase.sh` routing. This skill fixes only **ERROR**-level issues in replace rules. Warnings and informational findings are reported back to the user without auto-fixing.

## Input modes

This skill supports two input modes:

1. **Report mode (preferred)** — Read `rebase-rules-validation.md` from the repository root (produced by the `validate-rebase-rules` skill). Parse ERROR-level items from the **Replace Rules** section and fix each one.
2. **Single-file mode (fallback)** — A file path under `code/` is provided directly. Validate and fix the replace rules for that single file.

If no input is provided, check whether `rebase-rules-validation.md` exists. If it does, use report mode. If not, ask the user what to fix.

## Prerequisites

Ensure the `upstream-code` remote exists and is fetched:

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

## Step 1 — Resolve upstream versions

Read `rebase.sh` and extract two shell variables defined near the top:

- `CURRENT_UPSTREAM_VERSION` — e.g. `release/1.108`
- `PREVIOUS_UPSTREAM_VERSION` — e.g. `release/1.104`

Use these to fetch upstream file content:

```bash
git show upstream-code/<version>:<path-without-code-prefix>
```

Where `<path-without-code-prefix>` is the file path with the leading `code/` stripped (upstream stores VS Code sources at repo root).

## Step 2 — Collect items to fix

### Report mode

Read `rebase-rules-validation.md` and parse ERROR-level items from two sections:

1. **Replace Rules** table — rows with stale `from`/`by` values, encoding errors, etc.
2. **Uncovered Che-specific Changes** table — rows where Che-specific code has no rule.

Only process rows marked with **ERROR**. Skip WARNING and INFO rows — list them back to the user at the end as "not auto-fixed".

Extract from each ERROR row:
- The rule file path (e.g. `.rebase/replace/code/src/server-main.ts.json`) or the che-code file path (for uncovered changes)
- The problematic `from` or `by` value, or the uncovered line range
- Any proposed fix text (may be empty or partial — treat as a hint, not a final answer)

### Single-file mode

Given a file path (e.g. `code/src/server-main.ts`):
- The rule file is `.rebase/replace/<filepath>.json`
- Validate each rule entry against upstream and che-code (same as Step 3)

## Step 3 — Diagnose each broken rule

For each rule file to fix, gather context in parallel:

1. **Read the rule file** — `.rebase/replace/<code-path>.json` — a JSON array of `{ "from": "...", "by": "..." }` objects.
2. **Fetch upstream file** at `CURRENT_UPSTREAM_VERSION`:
   ```bash
   git show upstream-code/CURRENT_UPSTREAM_VERSION:<path-without-code-prefix>
   ```
3. **Read the che-code file** from the working tree at `<code-path>`.
4. **Fetch upstream file** at `PREVIOUS_UPSTREAM_VERSION` (for diff analysis):
   ```bash
   git show upstream-code/PREVIOUS_UPSTREAM_VERSION:<path-without-code-prefix>
   ```
5. **Check routing** in `rebase.sh` — check the `resolve_conflicts()` if/elif chain for a dedicated handler function (e.g. `apply_changes`, `apply_changes_multi_line`, or a custom function like `apply_code_vs_extensions_contribution_changes`).

### Path mapping

| Context | Path |
|---------|------|
| Rule file | `.rebase/replace/<code-path>.json` |
| Upstream file | `<code-path>` with leading `code/` stripped |
| che-code file | `<code-path>` in the working tree |

### Escape handling

Replace rule JSON uses a custom escaping convention. When reading values with `jq -r`, escapes are automatically decoded:

- `\n` in JSON → actual newline
- `\t` in JSON → actual tab
- `\\` in JSON → actual backslash

Always use `jq -r '.from'` / `jq -r '.by'` to get the real strings for comparison against file content.

### For each rule entry, classify the problem

| Check | Result | Diagnosis |
|-------|--------|-----------|
| `from` found in upstream at CURRENT version | Yes | `from` is OK |
| `from` NOT found in upstream at CURRENT version | — | `from` is stale — upstream changed the code |
| `by` found in che-code working tree | Yes | `by` is OK |
| `by` NOT found in che-code working tree | — | `by` is stale or was never applied |
| `from` found in upstream at PREVIOUS version | Yes | Confirms this was valid before; diff PREVIOUS→CURRENT to find what changed |
| `from` NOT found at PREVIOUS version either | — | Rule may have been wrong from the start or file was heavily refactored |

## Step 4 — Fix stale `from` values

This is the most common error: upstream changed the code that `from` was matching.

### 4a — Identify what changed

Compare the upstream file at `PREVIOUS_UPSTREAM_VERSION` vs `CURRENT_UPSTREAM_VERSION`:

```bash
diff <(git show upstream-code/PREVIOUS_UPSTREAM_VERSION:<path>) \
     <(git show upstream-code/CURRENT_UPSTREAM_VERSION:<path>)
```

Locate the area where the old `from` value was, and identify the corresponding new code in the current upstream.

### 4b — Construct the new `from`

- The new `from` must match a snippet in the **current upstream** file (`CURRENT_UPSTREAM_VERSION`).
- Use the **minimum unique text** that won't accidentally match elsewhere in the file, but include enough context to be stable across future changes.
- Preserve the same logical scope as the old `from` (e.g., if the old rule replaced a whole `if` block, the new one should too).

### 4c — Construct the new `by`

- The `by` value must produce the content that currently exists in the **che-code working tree** for that same code region.
- Read the che-code file, find the corresponding Che-modified code, and use that as the new `by`.
- If `by` also needs updating (e.g., because it referenced an old import path), update it too.

### 4d — Handle upstream file rename or removal

If the upstream file no longer exists at `CURRENT_UPSTREAM_VERSION`:
- Check if it was renamed: search for similar filenames or moved paths.
- If renamed: update the rule file path, the rule's `from`/`by`, and `rebase.sh` routing.
- If removed: report to the user that the rule and related Che changes need manual review. Do not auto-delete.

## Step 5 — Fix stale `by` values

Less common: `by` doesn't match the che-code working tree. This means either:
- The Che-specific change was updated without updating the rule.
- The rule was never applied correctly.

**Fix:** Read the actual che-code file, identify the Che-specific modification (relative to upstream), and update `by` to match.

## Step 6 — Choose the right handler

When writing new rule values, match the handler used in `rebase.sh` for this file.

| Handler in rebase.sh | Function | Encoding |
|----------------------|----------|----------|
| `apply_changes` | sed-based, single-line | See Sed encoding table below |
| `apply_changes_multi_line` | perl-based, wraps git checkout + apply + git add | See Perl encoding table below |
| `apply_multi_line_replace` | perl-based, raw replacement only | See Perl encoding table below |

### When to switch handler

- If the existing handler is `apply_changes` (sed) and the fix requires multiline `from`/`by`, switch to `apply_changes_multi_line` (perl) and update `rebase.sh`.
- If the fix is single-line and the current handler is sed, keep sed.
- **Prefer multiline (perl) for new or rewritten rules** — simpler encoding, handles all cases.

### Sed encoding (`apply_changes`)

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

### Perl encoding (`apply_changes_multi_line` / `apply_multi_line_replace`)

Values go through: JSON parse → `jq -r` → env var → perl `\Q\E` (from) / literal (by).

| Character in target | `from` encoding | `by` encoding |
|---------------------|----------------|---------------|
| Newline | `\n` | `\n` |
| Tab | `\t` | `\t` |
| Any special char | literal | literal |

**Key constraint:** Shell `$()` strips trailing newlines. Ensure `from`/`by` values don't end with `\n` — include following non-whitespace text as anchor.

## Step 7 — Write the fix

1. Update the rule JSON file with corrected `from`/`by` values.
2. If handler changed, update the routing in `rebase.sh`'s `resolve_conflicts()` if/elif chain (for custom handlers) or add a `.rebase/replace/` JSON file (for files handled by the smart fallback).
3. Keep JSON formatting consistent: 2-space indentation, array of objects.

## Step 8 — Fix routing in `rebase.sh` (if needed)

Check `rebase.sh`'s `resolve_conflicts()` function:

- For files needing special logic (jq merges, inline perl), add an `elif` branch with a dedicated handler function.
- For standard replace-rule files, add an `elif` branch calling `apply_changes "$conflictingFile"` (sed, single-line) or `apply_changes_multi_line "$conflictingFile"` (perl, multiline). Create the `.rebase/replace/<path>.json` rule file.
- The smart fallback in the `else` branch handles files with no che-specific changes automatically (takes upstream), but files WITH che-specific changes need an explicit elif entry or a `.rebase/` rule.
- Do not add duplicate entries.

## Step 9 — Validate every fix

For each fixed rule file, run all of these checks:

### 9a — JSON syntax

```bash
jq empty .rebase/replace/<code-path>.json
```

### 9b — Shell syntax

```bash
bash -n rebase.sh
```

### 9c — Dry-run: `from` exists in current upstream

For each rule entry, verify the new `from` string exists in the upstream file:

```bash
upstream_content=$(git show upstream-code/CURRENT_UPSTREAM_VERSION:<path-without-code-prefix>)
from_value=$(jq -r '.[INDEX].from' .rebase/replace/<code-path>.json)
```

Confirm `from_value` appears in `upstream_content`. Use a method that handles multiline strings correctly (e.g., `grep -F` or perl match).

### 9d — Dry-run: full replacement produces the che-code file

Apply the rule to the upstream file and compare with the che-code working tree file:

```bash
git show upstream-code/CURRENT_UPSTREAM_VERSION:<path> > /tmp/test-upstream

# For sed-based rules:
# (copy apply_replace logic from rebase.sh)

# For perl-based rules:
from=$(jq -r '.[INDEX].from' .rebase/replace/<code-path>.json)
by=$(jq -r '.[INDEX].by' .rebase/replace/<code-path>.json)
REPLACE_FROM="$from" REPLACE_BY="$by" perl -0777 -pe \
  'BEGIN { $from = $ENV{"REPLACE_FROM"}; $by = $ENV{"REPLACE_BY"}; } s|\Q$from\E|$by|g' \
  /tmp/test-upstream > /tmp/test-result

diff /tmp/test-result <code-path>
```

The diff should show **only** the Che-specific changes that are handled by **other** rule entries or non-rule modifications. If the only rule entry is this one, the diff should be empty.

If there are multiple rule entries for the same file, apply them all sequentially before comparing.

### 9e — Verify no accidental double-match

Ensure the `from` value appears **exactly once** in the upstream file. If it appears multiple times, the rule will replace all occurrences — which is usually wrong. Extend the `from` snippet with more context to make it unique.

## Step 10 — Report results

After fixing all items, report to the user:

1. **Fixed** — list each rule file and what was changed (old `from` → new `from`, etc.).
2. **Not auto-fixed (WARNING/INFO)** — list any warning/info items from the report that were skipped, so the user can review them manually.
3. **Failed to fix** — list any ERROR items that could not be resolved automatically (e.g., file removed upstream, heavy refactor requiring manual review).

## Handling uncovered Che-specific changes

The validation report may include an **"Uncovered Che-specific Changes"** section listing code in the che-code working tree that has no corresponding rebase rule. These changes would be silently lost during rebase.

### How to fix

For each uncovered change:

1. **Read the che-code file** at the reported line range to understand the Che-specific modification.
2. **Read the upstream file** at the same location to see what the original code looks like.
3. **Create a new rule entry** in the existing `.rebase/replace/<code-path>.json` file:
   - `from`: the upstream snippet that the Che change replaces or extends.
   - `by`: the Che-modified version from the working tree.
   - Ensure `from` is unique in the upstream file.
4. **If the file uses a custom function** in `rebase.sh` (e.g. `apply_code_*_changes()`), consider adding the replacement as an inline perl block in that function instead of a JSON entry, especially if the change needs multiline context to target uniquely.
5. **Validate** using the same dry-run steps as Step 9 — apply all rules to upstream and diff against che-code. The uncovered diff should now be empty.

### Common causes

- A Che-specific change was committed directly to the `code/` file without a corresponding rebase rule.
- A rule was added for part of a commit but another hunk in the same file was missed.
- A custom function in `rebase.sh` was removed or simplified, dropping a replacement that was previously handled.

## Common fix patterns

### Import path migration

Upstream frequently migrates from barrel imports to relative paths with `.js` extensions:

```
// Old upstream:
import { Foo } from 'vs/platform/foo/common/foo';
// New upstream:
import { Foo } from '../common/foo.js';
```

**Fix:** Update `from` to use the new import style. If the Che change was adding an import, update `by` to match the new style too.

### Type annotation changes

Upstream sometimes changes type casts or annotations:

```
// Old: as any
// New: as unknown as IProductConfiguration
```

**Fix:** Update `from` to match the new type expression. If the Che `by` was replacing the type, update accordingly.

### Added attributes / parameters

Upstream may add new attributes to HTML tags, new parameters to functions, etc. This shifts the text that `from` was matching.

**Fix:** Widen the `from` context to include the new attributes, or narrow it to a stable portion that didn't change.

### Whitespace / formatting changes

Upstream reformats code (indentation, line breaks).

**Fix:** Update `from` to match the new formatting. For multiline rules, be precise about indentation.

### Unescaped `&` in sed `by` values

Symptom: the replaced text contains the `from` match repeated where `&` or `&&` should appear (e.g. `#!/bin/sh#!/bin/sh` instead of `&&`).

**Fix:** Escape every `&` in the `by` value as `\\&`. For example, `&&` becomes `\\&\\&` in the JSON. Alternatively, switch the rule to a perl-based handler where `&` has no special meaning.

## Decision guidance

- **Prefer multiline (perl)** for new or rewritten rules — simpler encoding, handles all cases.
- **Keep sed** if existing rules work and only need minor `from`/`by` text updates.
- **Combine related rules** — if two sed rules operate on adjacent lines, a single multiline rule is cleaner.
- **Smallest safe snippet** — use the minimum unique text in `from` that won't accidentally match elsewhere, but include enough context to be stable.
- **NEVER change dependency versions without asking the user.** See `.claude/skills/dependency-rebase-rules/SKILL.md` for full guidelines. Versions in `.rebase/add/` and `.rebase/override/` rules are often pinned for CVE fixes. If a version conflict arises (e.g. npm EOVERRIDE), report it to the user — do not silently downgrade or remove the pin.
- **NEVER edit vanilla VS Code files without asking the user.** If a build or type error occurs in a file that exists identically in upstream VS Code, do NOT modify that file — upstream compiles successfully, so the error has a deeper root cause. Common causes: a Che-specific dependency pin (in `.rebase/add/` or `.rebase/override/`) overrides a version that upstream code depends on, or a rebase rule incorrectly strips a needed import/symbol. Always investigate the discrepancy between our build environment and upstream before proposing changes. Needing to edit a non-Che-specific file is a strong signal that more investigation is required.

## Parallelization

When fixing multiple rules from a report:
- All rule files can be diagnosed independently (Step 3) — launch in parallel.
- Upstream file fetches can be batched.
- Fixes (Step 7) and validations (Step 9) for different files are independent.
