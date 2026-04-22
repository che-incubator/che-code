---
name: rebase
description: Orchestrates a full upstream VS Code rebase for che-code. Updates version references, validates and fixes rebase rules against the new upstream, runs rebase.sh, handles remaining conflicts, and verifies the result. Use when asked to rebase, align with upstream, or update to a new VS Code release.
---

# Rebase che-code Against Upstream VS Code

End-to-end workflow for rebasing the che-code fork against a new upstream VS Code release. This skill coordinates three other skills (`validate-rebase-rules`, `fix-rebase-rules`, `test-rebase-rules`) along with `rebase.sh`.

## Input

The user provides the **target VS Code release branch** (e.g. `release/1.120`). If not provided, ask.

## Prerequisites

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

Verify the target branch exists:

```bash
git rev-parse --verify upstream-code/<target-version> > /dev/null 2>&1
```

## Phase 1 — Prepare

### Step 1: Update version references in `rebase.sh`

Read `rebase.sh` and extract the current values:

- `PREVIOUS_UPSTREAM_VERSION` — the version that was previously rebased to
- `CURRENT_UPSTREAM_VERSION` — the version for the current/next rebase

Update them:

```bash
# PREVIOUS_UPSTREAM_VERSION becomes what was CURRENT_UPSTREAM_VERSION
# CURRENT_UPSTREAM_VERSION becomes the new target
```

For example, if CURRENT was `release/1.108` and the new target is `release/1.120`:

```
PREVIOUS_UPSTREAM_VERSION="release/1.108"
CURRENT_UPSTREAM_VERSION="release/1.120"
```

### Step 2: Fetch the new upstream branch

```bash
git fetch upstream-code <target-version>
```

### Step 3: Run pre-rebase validation

Run `pre-rebase.sh` to discover all conflicts and classify them:

```bash
bash pre-rebase.sh
```

This performs a trial subtree merge on a temp branch, classifies every conflicting file, and writes `.rebase/reports/pre-rebase-report-<version>.md` (e.g. `pre-rebase-report-1.120.md`). The report starts with a raw list of all conflicting files, then categorizes them as:

- **RULED** — has `.rebase/` rules and an `elif` entry in `resolve_conflicts()`. Ready.
- **LOCK** — `package-lock.json` files. Auto-handled by the generic `resolve_package_lock` function.
- **TAKE_THEIRS** — no che-specific changes vs previous upstream. Safe to take upstream.
- **MISSING_ELIF** — has `.rebase/` rules but no `elif` entry. The smart fallback handles these, but explicit entries are recommended.
- **NEEDS_RULE** — che-specific changes exist but no `.rebase/` rule covers them. **These MUST be fixed before proceeding.**

If `pre-rebase.sh` exits with code 1, there are NEEDS_RULE files to address.

### Step 3b: Audit dependency pins

**Before proceeding with rule fixes**, audit all dependency version pins in `.rebase/add/` and `.rebase/override/` files against the new upstream. Follow the process in `.claude/skills/dependency-rebase-rules/SKILL.md`:

1. Compare every pinned version against what upstream uses at the target release
2. Classify each pin as ACTIVE, REDUNDANT, or OUTDATED
3. Add a "Dependency Pin Audit" section to the pre-rebase report
4. Present findings to the user and get confirmation before removing/updating any pins
5. After removing redundant pins, verify lock file stability (`npm install` should produce no changes)

This step prevents build failures caused by outdated pins (e.g. old `@types/*` versions breaking upstream code) and avoids committing unstable lock files.

### Step 4: Create missing rules (if NEEDS_RULE files exist)

For each NEEDS_RULE file in the report, use the `fix-rebase-rules` skill (read `.claude/skills/fix-rebase-rules/SKILL.md`), specifically its "Handling uncovered Che-specific changes" workflow. This approach works directly from the current file state — no commit SHA needed:

1. Read the che-code file to understand the che-specific modification
2. Read the upstream file at `PREVIOUS_UPSTREAM_VERSION` to see the original code
3. Create a rule: `from` = upstream snippet, `by` = che-modified version
4. For source files (.ts, .html, etc.) — creates `.rebase/replace/<path>.json`
5. For JSON files (package.json) — creates `.rebase/add/` and/or `.rebase/override/` rules
6. Also updates `rebase.sh` routing — adds the `elif` entry

If rule creation fails (e.g. the change is too complex to express as a single rule), report the problem and stop for manual review.

### Step 5: Add missing elif entries (if MISSING_ELIF files exist)

For files that have `.rebase/` rules but no `elif` entry in `resolve_conflicts()`, add the entry following the existing patterns. The smart fallback in the `else` branch will handle these at runtime, but explicit entries are more reliable.

### Step 6: Validate existing rules against the NEW upstream

Run the `validate-rebase-rules` skill (read `.claude/skills/validate-rebase-rules/SKILL.md`). This produces `rebase-rules-validation.md`.

Key point: the validation now runs against the **new** `CURRENT_UPSTREAM_VERSION`, so it will catch all `from` values that changed between the old and new upstream.

### Step 7: Fix stale rules

If the validation report has ERROR-level items, run the `fix-rebase-rules` skill (read `.claude/skills/fix-rebase-rules/SKILL.md`).

Common issues:
- **Stale `from` values** — upstream changed the code that `from` was matching. The fix skill updates `from` to match the new upstream and `by` to produce the current che-code result.
- **Missing rules** — the "Uncovered Che-specific Changes" section lists code that would be lost. Create new rules for these.

### Step 8: Test the fixed rules

Run the `test-rebase-rules` skill (or directly):

```bash
bash .claude/skills/test-rebase-rules/run-all-tests.sh
```

All tests must pass (or show only cosmetic warnings) before proceeding.

## Phase 2 — Rebase

### Step 9: Run the rebase

```bash
bash rebase.sh
```

**Expected outcomes:**

| Outcome | Action |
|---------|--------|
| `rebase operation done successfully` | No conflicts. Skip to Phase 3. |
| `rebase successful after conflict solving` | All conflicts auto-resolved by `resolve_conflicts()`. Skip to Phase 3. |
| Script aborts with an error | See Step 8. |

### Step 10: Handle remaining conflicts (if any)

If `rebase.sh` failed, check what went wrong:

**a) Replace rule failed (`Unable to perform the replace`):**
A rule's `from` value didn't match the file content. This means the rule fix from Phase 1 was incomplete or the new upstream has additional changes. Fix the specific rule and re-run `rebase.sh`.

**b) Unknown file conflict — che-specific changes without rule:**
The smart fallback in `resolve_conflicts()` detects che-specific changes by comparing against the previous upstream. If found, it aborts with a message to run `pre-rebase.sh`. Create the missing rule (using `fix-rebase-rules` skill) and re-run `rebase.sh`.

**c) npm install failure during package-lock resolution:**
Network issues or incompatible dependencies. Fix manually and `git add` the resolved file, then `GIT_EDITOR=: git merge --continue`.

**d) npm EOVERRIDE — override conflicts with direct dependency:**
npm requires that overrides for direct dependencies use the exact same version spec. If an add-rule override (e.g. `overrides.tar: "^7.5.11"`) conflicts with an upstream direct dependency (e.g. `devDependencies.tar: "^7.5.9"`), **do NOT downgrade the override** — it was likely pinned for a CVE fix. Instead, add the override version to `.rebase/override/` for the same dependency section (e.g. `devDependencies.tar: "^7.5.11"` in `.rebase/override/code/package.json`) so the direct dependency matches the override. Always ask the user before changing pinned dependency versions.

### Step 11: Verify no remaining conflicts

```bash
git diff --name-only --diff-filter=U
```

Should return empty. If not, resolve manually and continue the merge:

```bash
GIT_EDITOR=: git merge --continue
```

## Phase 3 — Verify

### Step 12: Build check

Run a quick compilation check:

```bash
cd code
npm install
npm run watch
```

Wait for compilation to complete. Check for TypeScript errors.

**CRITICAL — Do NOT edit vanilla VS Code files.** If a compilation error occurs in a file that is NOT Che-specific (i.e. it exists identically in upstream VS Code), do NOT fix it by modifying that file. Upstream VS Code compiles successfully, so the error indicates a deeper root cause — typically a Che-specific dependency version pin (in `.rebase/add/` or `.rebase/override/`) that conflicts with what upstream expects, or a Che rebase rule that incorrectly strips a needed import/type. Investigate why the error occurs only in our build before changing any code. Always ask the user before modifying upstream files.

### Step 13: Run tests (optional but recommended)

```bash
cd code
npm run test-node
```

### Step 14: Run rebase rule tests against the final state

```bash
bash .claude/skills/test-rebase-rules/run-all-tests.sh
```

This verifies that the rules still produce the correct output against the now-current upstream. All tests should pass.

### Step 15: Update artifacts lock

After all conflicts are resolved, rules are applied, and the build is verified, regenerate `build/artifacts/artifacts.lock.yaml`. This file pins the download URLs and SHA256 checksums for built-in extensions and tools (ripgrep, js-debug, etc.) and must match what the new upstream ships.

```bash
./build/artifacts/generate.sh
```

This updates versions and checksums in `artifacts.lock.yaml` to reflect the new upstream release.

**This must be a separate commit** containing only `build/artifacts/artifacts.lock.yaml` (and any lock files that change as a side effect, like `code/test/mcp/package-lock.json`). Do not mix it with other changes.

## Troubleshooting

### Rules keep failing after fixes

If many rules fail, it may be more efficient to:
1. Take the upstream version of the file (`git checkout --theirs <file>`)
2. Look at the che-code diff from the previous release
3. Manually re-apply the che-specific changes
4. Update the rule to match the new upstream

### Files with custom handlers in rebase.sh

Some files have special handler functions in `rebase.sh` with inline logic beyond `.rebase/` rules. These may need code updates when upstream changes the target code:
- `apply_code_package_changes` — code/package.json (override + add + replace)
- `apply_code_product_changes` — product.json (jq merge + builtInExtensions append + key reorder)
- `apply_github_auth_package_changes` — removes `.contributes` key
- `apply_code_vs_extensions_contribution_changes` — sed + inline perl for CommandPalette when clause
- `apply_code_vs_workbench_contrib_remote_browser_remote_changes` — sed + inline perl for cheDisconnectionHandler

### Large version jumps (>4 releases)

Jumping many releases at once (e.g. 1.108 → 1.120) will likely produce many stale rules. Consider:
1. Breaking it into smaller incremental rebases
2. Or accepting that Phase 1 will take longer to fix all rules

### New che-specific files or extensions

If a new che-specific extension is added under `code/extensions/che-*`, it does NOT need rebase rules (those directories are not affected by `git checkout --theirs`).

If che-specific code is added to an upstream file, a new `.rebase/replace/` rule MUST be created, otherwise the change will be lost on next rebase.

## How `resolve_conflicts()` works (for reference)

The `resolve_conflicts()` function in `rebase.sh` processes conflicts in two passes:

**Pass 1 — All files except package-lock.json:**

Files are processed in the order returned by `git diff --name-only --diff-filter=U` (alphabetical). Package-lock.json files are collected into an array and deferred. Each non-lock file is matched against the `if/elif` chain:

1. **Explicit elif entries** — Most files have a dedicated branch that calls the appropriate handler (`apply_changes`, `apply_changes_multi_line`, `apply_package_changes_by_path`, or a custom function).
2. **Smart fallback (else branch)** — Unknown files are checked for che-specific changes by comparing `HEAD:<file>` against `upstream-code/PREVIOUS_UPSTREAM_VERSION:<path>`. If identical to previous upstream, the file is safe to take from upstream. If different, the script aborts with a message to create a rule.

**Pass 2 — Package-lock.json files (deferred):**

After all package.json and source files are resolved, lock files are processed via `resolve_package_lock()`:

1. `git checkout --theirs` — take upstream lock as base
2. `npm install --ignore-scripts --prefix <dir>` — regenerate to reflect the resolved package.json
3. `git add` — stage the result

This deferred approach ensures that package.json files (which appear after package-lock.json alphabetically) are always resolved before their lock files need regeneration.
