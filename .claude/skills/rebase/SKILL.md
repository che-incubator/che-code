---
name: rebase
description: Orchestrates a full upstream VS Code rebase for che-code. Updates version references, validates and fixes rebase rules against the new upstream, runs rebase.sh, handles remaining conflicts, and verifies the result. Use when asked to rebase, align with upstream, or update to a new VS Code release.
---

# Rebase che-code Against Upstream VS Code

End-to-end workflow for rebasing the che-code fork against a new upstream VS Code release. This skill coordinates three other skills (`validate-rebase-rules`, `fix-rebase-rules`, `test-rebase-rules`) along with `rebase.sh`.

## Input

The user provides the **target VS Code release** in one of three forms:

- **Full branch name:** `release/1.120` — used as-is
- **Short version:** `1.120` — expanded to `release/1.120`
- **Issue URL:** `https://github.com/eclipse-che/che/issues/23823` — fetch the issue title/body via `gh issue view -R eclipse-che/che <number>`, extract the version (pattern: `1.NNN.x` or `1.NNN`), expand to `release/1.NNN`

If the user provides an issue URL, store it for later use in the PR description ("What issues does this PR fix?" section).

If not provided, ask.

### Version validation

All three input forms go through the same validation:

1. **Format check:** the resolved value must match `release/1.NNN` (e.g. `release/1.120`)
2. **Greater-than check:** read `CURRENT_UPSTREAM_VERSION` from `rebase.sh`, parse numeric parts, the target must be strictly greater. For example, if `CURRENT_UPSTREAM_VERSION="release/1.116"` and the user provides `1.115`, inform them: "Version 1.115 is not valid — the current upstream version is already release/1.116"
3. **Upstream existence check:** verify the branch exists: `git ls-remote upstream-code refs/heads/release/1.NNN`

If all checks pass: proceed silently.
If any check fails: inform user what went wrong and ask for the correct version.

## Branch Management

After validating the target version:

1. Read `target_remote` from `.rebase/rebase-config.yaml` and ensure it is configured as a git remote named `target` (add it if not: `git remote add target <url>`)
2. Fetch the target remote's main: `git fetch target main`
3. Check current branch: `git branch --show-current`
4. If on `main`: create and switch to a new branch based on `target/main`:
   ```bash
   git checkout -b alignment-with-upstream-1-<version> target/main
   ```
   For example, target `release/1.120` produces branch `alignment-with-upstream-1-120`.
5. If already on the matching `alignment-with-upstream-1-<version>` branch: continue on it
6. If on any other branch (including a different `alignment-with-upstream-*`):
   - If there are uncommitted changes (`git status --porcelain`): warn the user and stop
   - If clean: create and switch to a new branch based on `target/main`

## Prerequisites

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

## Commit Strategy

Each logical step produces a separate commit following single responsibility. Every commit becomes a checkbox in the PR description. Conditional commits are only created when there is work to do.

1. **Update upstream version references** — `rebase.sh` (`PREVIOUS_UPSTREAM_VERSION`, `CURRENT_UPSTREAM_VERSION`)
2. **Pre-rebase conflict analysis** — `.rebase/<ver>/pre-rebase-report.md`
3. **Audit and update dependency pins (CVE fixes)** — `.rebase/<ver>/dependency-audit.md` + `.rebase/add/`, `.rebase/override/`, `code/` changes
4. **Create rebase rules for uncovered files** — new `.rebase/replace/` + `elif` entries *(conditional)*
5. **Fix and update rebase rules** — fixed `.rebase/replace/` + missing `elif` entries *(conditional)*
6. **Rebase against upstream** — merge commit from `rebase.sh`
7. **Fix rebase errors** — npm install / EOVERRIDE fixes *(conditional)*
8. **Fix compilation errors** — code fixes *(conditional)*
9. **Update artifacts lock** — `build/artifacts/artifacts.lock.yaml`

## Reports

All reports are written to `.rebase/<version>/` (e.g. `.rebase/1.120/`). Create the directory at the start of the rebase:

```bash
mkdir -p .rebase/<version>
```

Reports generated during the process:
- `.rebase/<ver>/pre-rebase-report.md` — conflict classification from `pre-rebase.sh`
- `.rebase/<ver>/dependency-audit.md` — dependency pin audit results
- `.rebase/<ver>/rebase-errors.md` — Phase 2 errors if unfixed *(conditional)*
- `.rebase/<ver>/compilation-errors.md` — Phase 3 compilation errors if unfixed *(conditional)*

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

**Commit:** "Update upstream version references"

### Step 2: Fetch the new upstream branch

```bash
git fetch upstream-code <target-version>
```

### Step 3: Run pre-rebase validation

Run `pre-rebase.sh` to discover all conflicts and classify them:

```bash
bash pre-rebase.sh
```

This performs a trial subtree merge on a temp branch, classifies every conflicting file, and writes `.rebase/<ver>/pre-rebase-report.md`. The report starts with a raw list of all conflicting files, then categorizes them as:

- **RULED** — has `.rebase/` rules and an `elif` entry in `resolve_conflicts()`. Ready.
- **LOCK** — `package-lock.json` files. Auto-handled by the generic `resolve_package_lock` function.
- **TAKE_THEIRS** — no che-specific changes vs previous upstream. Safe to take upstream.
- **MISSING_ELIF** — has `.rebase/` rules but no `elif` entry. The smart fallback handles these, but explicit entries are recommended.
- **NEEDS_RULE** — che-specific changes exist but no `.rebase/` rule covers them. These are handled in Step 4.

If `pre-rebase.sh` exits with code 1, there are NEEDS_RULE files — proceed to Step 4.

**Commit:** "Pre-rebase conflict analysis" (includes the report file)

### Step 3b: Audit dependency pins

Audit all dependency version pins in `.rebase/add/` and `.rebase/override/` files against the new upstream. Follow the process in `.claude/skills/dependency-rebase-rules/SKILL.md`:

1. Compare every pinned version against what upstream uses at the target release
2. Classify each pin as ACTIVE, REDUNDANT, or OUTDATED
3. Write the audit report to `.rebase/<ver>/dependency-audit.md`
4. Apply recommended changes (remove redundant pins, move pins to override, update `code/` files)
5. After removing redundant pins, verify lock file stability (`npm install` should produce no changes)

Do not stop for user confirmation — apply changes and document everything in the report for review in the PR.

**Commit:** "Audit and update dependency pins (CVE fixes)" (includes the report + all pin changes)

### Step 4: Create missing rules (if NEEDS_RULE files exist)

For each NEEDS_RULE file in the pre-rebase report, use the `fix-rebase-rules` skill (read `.claude/skills/fix-rebase-rules/SKILL.md`), specifically its "Handling uncovered Che-specific changes" workflow:

1. Read the che-code file to understand the che-specific modification
2. Read the upstream file at `PREVIOUS_UPSTREAM_VERSION` to see the original code
3. Create a rule: `from` = upstream snippet, `by` = che-modified version
4. For source files (.ts, .html, etc.) — creates `.rebase/replace/<path>.json`
5. For JSON files (package.json) — creates `.rebase/add/` and/or `.rebase/override/` rules
6. Also updates `rebase.sh` routing — adds the `elif` entry

If rule creation fails for a file: check whether that file actually conflicts in the rebase (from the pre-rebase report conflict list). If it conflicts, this is a real blocker — stop for manual review. If it does not conflict, log as ERROR in the pre-rebase report and continue.

**Commit (conditional):** "Create rebase rules for uncovered files"

### Step 5: Add missing elif entries (if MISSING_ELIF files exist)

For files that have `.rebase/` rules but no `elif` entry in `resolve_conflicts()`, add the entry following the existing patterns.

### Step 6: Validate existing rules against the NEW upstream

Run the `validate-rebase-rules` skill (read `.claude/skills/validate-rebase-rules/SKILL.md`). This produces `rebase-rules-validation.md`.

Key point: the validation now runs against the **new** `CURRENT_UPSTREAM_VERSION`, so it will catch all `from` values that changed between the old and new upstream.

### Step 7: Fix stale rules

If the validation report has ERROR-level items, run the `fix-rebase-rules` skill (read `.claude/skills/fix-rebase-rules/SKILL.md`).

Common issues:
- **Stale `from` values** — upstream changed the code that `from` was matching. The fix skill updates `from` to match the new upstream and `by` to produce the current che-code result.
- **Missing rules** — the "Uncovered Che-specific Changes" section lists code that would be lost. Create new rules for these.

If a fix fails for a file: same logic as Step 4 — if the file conflicts in the rebase, stop; if not, log as ERROR and continue.

### Step 8: Test the fixed rules

Run the `test-rebase-rules` skill (or directly):

```bash
bash .claude/skills/test-rebase-rules/run-all-tests.sh
```

All tests must pass (or show only cosmetic warnings) before proceeding. If a test fails, re-fix the rule and re-test (retry loop). If repeated attempts fail, apply the same conflict/no-conflict logic from Steps 4 and 7.

**Commit (conditional, covers Steps 5-8):** "Fix and update rebase rules"

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
| Script aborts with an error | See Step 10. |

### Step 10: Handle remaining conflicts (if any)

If `rebase.sh` failed, try to fix automatically. If the fix succeeds, it becomes a commit. If not, document in `.rebase/<ver>/rebase-errors.md` and continue.

**a) Replace rule failed (`Unable to perform the replace`):**
A rule's `from` value didn't match the file content. This should not happen if Phase 1 was done correctly. Fix the specific rule and re-run `rebase.sh`.

**b) Unknown file conflict — che-specific changes without rule:**
The smart fallback in `resolve_conflicts()` detects che-specific changes by comparing against the previous upstream. If found, it aborts with a message to run `pre-rebase.sh`. Create the missing rule (using `fix-rebase-rules` skill) and re-run `rebase.sh`.

**c) npm install failure during package-lock resolution:**
Network issues or incompatible dependencies. Try to fix by adjusting dependency pins or re-running. If unfixable, document in `.rebase/<ver>/rebase-errors.md`.

**d) npm EOVERRIDE — override conflicts with direct dependency:**
npm requires that overrides for direct dependencies use the exact same version spec. If an add-rule override (e.g. `overrides.tar: "^7.5.11"`) conflicts with an upstream direct dependency (e.g. `devDependencies.tar: "^7.5.9"`), **do NOT downgrade the override** — it was likely pinned for a CVE fix. Instead, add the override version to `.rebase/override/` for the same dependency section. Try to fix automatically; if not possible, document in the rebase errors report.

**Commit (conditional):** "Fix rebase errors" (with report sub-item if unfixed errors remain)

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

**CRITICAL — Do NOT edit vanilla VS Code files.** If a compilation error occurs in a file that is NOT Che-specific (i.e. it exists identically in upstream VS Code), do NOT fix it by modifying that file. Upstream VS Code compiles successfully, so the error indicates a deeper root cause — typically a Che-specific dependency version pin (in `.rebase/add/` or `.rebase/override/`) that conflicts with what upstream expects, or a Che rebase rule that incorrectly strips a needed import/type. Investigate why the error occurs only in our build before changing any code.

If errors are found:
- For files with rebase rules or che-specific logic: attempt to fix, create a commit
- If fix fails or file is vanilla upstream: write `.rebase/<ver>/compilation-errors.md` with affected files, whether a rebase rule exists, and error messages
- **Do NOT block** — continue to PR creation regardless

**Commit (conditional):** "Fix compilation errors" (with report sub-item if unfixed errors remain)

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

**Commit:** "Update artifacts lock" — containing only `build/artifacts/artifacts.lock.yaml` (and any lock files that change as a side effect, like `code/test/mcp/package-lock.json`). Do not mix with other changes.

## Phase 4 — Create Pull Request

### Step 16: Create Pull Request

1. Read `.rebase/rebase-config.yaml` for `target_remote` and testing config
2. Read `code/package.json` to get the `version` field (e.g. `1.120.0`)
3. Collect all commit hashes created during this rebase (from `git log`)
4. Push the branch to the target remote:
   ```bash
   git push -u target HEAD
   ```
5. Create the draft PR with a minimal body:
   ```bash
   gh pr create --draft --repo <target_remote> --base main \
     --title "Alignment with <version> version of VS Code" \
     --body "Initial PR creation — updating body with details..."
   ```
6. Extract PR number from the returned URL
7. Build the full PR body (see template below) with commit hashes and test table containing the PR number
8. Update the PR:
   ```bash
   gh pr edit <PR_NUMBER> --body "<full body>"
   ```

### PR title

`Alignment with <version> version of VS Code` where `<version>` comes from `code/package.json` `version` field (e.g. `1.120.0`).

### PR body template

Build the body using the `.github/PULL_REQUEST_TEMPLATE.md` structure. All commits get a checkbox. Conditional commits only appear if created. Reports are nested sub-items.

```markdown
### What does this PR do?

- [x] Alignment with <version> version of VS Code: https://github.com/microsoft/vscode/tree/release/<branch-ver>
- [x] Update upstream version references: <commit-hash>
- [x] Pre-rebase conflict analysis: <commit-hash>
    - [Pre-rebase-report](.rebase/<ver>/pre-rebase-report.md)
- [x] Audit and update dependency pins (CVE fixes): <commit-hash>
    - [Dependency-audit-report](.rebase/<ver>/dependency-audit.md)
- [x] Create rebase rules for uncovered files: <commit-hash>
- [x] Fix and update rebase rules: <commit-hash>
- [x] Rebase against upstream: <commit-hash>
- [ ] Fix rebase errors: <commit-hash>
    - [Rebase-errors-report](.rebase/<ver>/rebase-errors.md)
- [ ] Fix compilation errors: <commit-hash>
    - [Compilation-errors-report](.rebase/<ver>/compilation-errors.md)
- [x] Update artifacts lock: <commit-hash>

### What issues does this PR fix?

<issue-reference or empty>

### How to test this PR?

Test starting a workspace and basic functionality for the following images

<test-table generated from rebase-config.yaml>

### Does this PR contain changes that override default upstream Code-OSS behavior?
- [x] the PR contains changes in the [code](https://github.com/che-incubator/che-code/tree/main/code) folder (you can skip it if your changes are placed in a che extension )
- [ ] the corresponding items were added to the [CHANGELOG.md](https://github.com/che-incubator/che-code/blob/main/.rebase/CHANGELOG.md) file
- [x] rules for automatic `git rebase` were added to the [.rebase](https://github.com/che-incubator/che-code/tree/main/.rebase) folder
```

### Test table generation

Read `.rebase/rebase-config.yaml` to build the test table. For each image group:

1. Add a row with the group label in bold (e.g. `**udi**`) — no link
2. For each image entry, generate a workspace link:
   ```
   <instance_url>/#<sample_repo>?new&image=<image-name>&editor-image=<editor_image_base>:pr-<PR_NUMBER>-amd64
   ```

Example row:
```
| quay.io/devfile/universal-developer-image:ubi8-latest | | [click here](<url>) |
```

## Stop Point Policy

The process should never fully stop. All issues are either auto-fixed (with a commit) or documented in a report for the user to address in follow-up commits.

- **Phase 1:** mostly auto-handled. Only stops if a fix truly can't be created AND the file conflicts in the rebase. Non-conflicting failures are logged as ERRORs in reports.
- **Phase 2:** try to fix npm install / EOVERRIDE errors automatically. If not possible, create `.rebase/<ver>/rebase-errors.md` and continue to PR creation.
- **Phase 3:** compilation errors do not stop the process. Create a fix commit if possible, otherwise create `.rebase/<ver>/compilation-errors.md` and continue to PR creation.

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
