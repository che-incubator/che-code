---
name: dependency-rebase-rules
description: Guidelines for working with rebase rules related to package.json dependencies, versions, and overrides. Covers CVE pins, version conflict detection, and package-lock.json handling. Referenced by rebase, fix-rebase-rules, validate-rebase-rules, and add-rebase-rules skills.
---

# Dependency Rebase Rules

This skill provides shared guidelines for working with `.rebase/add/` and `.rebase/override/` rules that affect `package.json` dependencies, devDependencies, and overrides. All rebase-related skills should follow these rules.

## Background

### `.rebase/add/` — for things ABSENT in upstream

The `add` folder contains JSON fragments that are **merged into** upstream files. The semantics are: "add something that upstream doesn't have." This means:

- A dependency in `.rebase/add/code/package.json` should only be there if upstream does NOT have that dependency at all
- Once upstream adopts the same dependency (even at a different version), the `add` rule is no longer correct — it must be either **removed** or **moved to `.rebase/override/`**

### `.rebase/override/` — for things that EXIST in upstream but need a different value

The `override` folder contains JSON fragments that **replace values** in upstream files. Use this when upstream has the dependency but we need a different version (e.g. for a CVE fix).

### Why pins exist

Most dependency pins exist for one of two reasons:

1. **CVE fixes** — pinning a dependency to a version that fixes a security vulnerability
2. **Compatibility** — pinning a version that upstream doesn't use but Che needs

### What goes wrong when pins become stale

Over time, upstream may adopt the same or newer versions, making some pins redundant or harmful:

- **npm EOVERRIDE** — when an override version conflicts with a direct dependency version
- **Type mismatches** — when a pinned `@types/*` package is too old for upstream code that depends on newer APIs (e.g. pinning `@types/ws: 8.2.0` while upstream code uses APIs from `@types/ws: ^8.18.1`)
- **Build failures in vanilla VS Code files** — the symptom of a type mismatch; the root cause is always the stale pin, NOT the upstream file
- **Stale lock files** — when a pin forces a different resolution than what `npm install` produces, causing `package-lock.json` to change on every build

## Pinned Exceptions (never change)

The following dependencies are intentionally pinned and must **never** be removed, updated, or moved during audits or rebases, regardless of what upstream uses:

| Dependency | File | Reason |
|-----------|------|--------|
| @vscode/l10n-dev | .rebase/override/code/package.json | Che requires this specific version; do not align with upstream. |

When the audit encounters one of these, classify it as **KEEP (exception)** and skip further analysis.

## Core Principles

### Never downgrade versions

**NEVER** downgrade a dependency version in a rebase rule. Versions are pinned for security or compatibility reasons. If a conflict arises, investigate the root cause — do not silently lower the version.

### Never edit vanilla VS Code files to work around dependency issues

If upstream code fails to compile because of a Che dependency pin, the fix belongs in the rebase rules (remove or update the pin), **not** in the upstream source file. Upstream VS Code compiles successfully with its own dependencies — if our build breaks, our pins are the cause.

### Ask the user before changing any version

Before adding, removing, or changing any dependency version in `.rebase/add/` or `.rebase/override/` rules, always ask the user for confirmation. Explain what the current pin is, what upstream uses, and what you recommend.

## Detecting Redundant or Conflicting Dependency Pins

### When to check

Dependency pins should be audited during **Phase 1 (Prepare)** of the rebase process, after fetching the new upstream branch but before running `rebase.sh`. This is the `pre-rebase` step where all conflicts are already visible.

### How to check

The audit is a two-pass process: a fast first pass comparing direct deps against the upstream `package.json` files (no install needed), then a second pass using `npm ls` in a worktree to check transitive overrides.

#### Step 1 — List all dependency pins

Read each `.rebase/add/` and `.rebase/override/` file that targets a `package.json`. Collect all version entries from `dependencies`, `devDependencies`, and `overrides` sections.

#### Step 2a — Compare direct dependencies against upstream (fast pass)

For `dependencies` and `devDependencies` entries, compare against the upstream `package.json` directly — no install needed:

```bash
git show upstream-code/<target-branch>:<path-without-code-prefix> | jq '.dependencies["<pkg>"], .devDependencies["<pkg>"]'
```

This resolves all direct dependency pins quickly. Mark each as KEEP, REMOVE, or MOVE per the classification rules in Step 3.

#### Step 2b — Check transitive overrides via worktree (npm ls pass)

For `overrides` entries (npm overrides section), you must check the **resolved dependency tree**, not just the `package.json`. This requires a worktree with `npm install`.

**Create a temporary worktree:**

```bash
git fetch upstream-code release/<version>
git worktree add /tmp/upstream-vscode-<version> FETCH_HEAD --detach
```

**Install and check each directory that has overrides.** Each subdirectory with its own `package.json` has an independent dependency tree and needs its own `npm install`:

```bash
# Root
cd /tmp/upstream-vscode-<version>
npm install --ignore-scripts
npm ls <pkg1> <pkg2> ...

# For each subdirectory (build/, remote/, test/smoke/, extensions/npm/, etc.):
cd <subdir>
npm install --ignore-scripts
npm ls <pkg1> <pkg2> ...
```

Run installs and `npm ls` in parallel across independent directories to save time. Batch all packages for a given directory into a single `npm ls` call.

**Key things to look for in `npm ls` output:**

- The resolved version number for each transitive dep
- Whether the parent package still exists in the tree (if absent → orphaned override)
- Multiple instances at different versions (e.g. `micromatch@4.0.8` AND `micromatch@3.1.10`) — if ANY instance is below the Che pin, the override is still needed
- The `(empty)` result means the package is not in the tree at all

**Supplemental checks:** If the initial `npm ls` batch didn't cover all packages (e.g. `path-to-regexp` was in a scoped override but not queried), re-run targeted checks. Also verify that parent packages referenced in scoped overrides (like `schema-utils@3`, `ajv-keywords@3`) still exist in the tree — if `npm ls` returns `(empty)`, the override is orphaned.

**Clean up when done:**

```bash
git worktree remove /tmp/upstream-vscode-<version> --force
```

#### Step 3 — Classify each pin and decide action

For each pin, first check: **does the dependency now exist in the upstream `package.json` at `CURRENT_UPSTREAM_VERSION`?**

**If the pin is in `.rebase/add/` and the dependency NOW EXISTS in upstream:**

The `add` rule is no longer correct (add = "things absent in upstream"). Apply this decision tree:

| Che pin version vs upstream version | Action |
|-------------------------------------|--------|
| Che version **<** upstream version | **REMOVE** the rule entirely. Upstream has a higher version. Record in report. |
| Che version **=** upstream version | **REMOVE** the rule entirely. Upstream already has the same version. Record in report. |
| Che version **>** upstream version | **MOVE** the rule from `.rebase/add/` to `.rebase/override/`. The pin enforces a newer version (likely CVE fix). Record in report. |

**If the pin is in `.rebase/add/` and the dependency does NOT exist in upstream:**

| Classification | Action |
|----------------|--------|
| **ACTIVE** — upstream doesn't have it | Keep the pin in `.rebase/add/` |

**If the pin is in `.rebase/override/`:**

| Che pin version vs upstream version | Action |
|-------------------------------------|--------|
| Che version **>** upstream version | **ACTIVE** — keep the override |
| Che version **=** upstream version | **REDUNDANT** — can be removed. Record in report. |
| Che version **<** upstream version | **OUTDATED** — remove. Upstream moved past our pin. Record in report. |

**For `overrides` entries (npm overrides section):**

These target transitive dependencies, not direct dependencies. Check the full dependency tree, not just the top-level `package.json`:

```bash
# In an upstream checkout at the target version:
npm ls <pkg>
```

If upstream's resolved tree already uses a version >= the pin, the override is redundant and can be removed.

**Important:** The same dependency can appear at different versions in different places in the tree. Be careful — check all instances, not just the first one.

#### Step 4 — Generate a report

Create a standalone audit report at `.rebase/<version>/dependency-audit.md`. This is a separate file (not a section in the pre-rebase report) because it can be large.

**Report structure:**

1. **Header** — date, target upstream version, commit hash
2. **Per-file tables** — one section per `.rebase/add/` or `.rebase/override/` file, with columns: Dependency, Che Pin, Upstream Resolved, In Upstream?, Action, Reason
3. **Summary** — grouped by action: REMOVE (with numbered list), KEEP (CVE still needed), KEEP (Che-specific), KEEP (exceptions), MOVE

For transitive overrides that require `npm ls`, initially mark them as **NEEDS MANUAL CHECK** in the report. After running the checks, update each entry with the actual resolved version and classification. Include the full dependency chain in the Reason column (e.g. `@azure/msal-node→jsonwebtoken@9.0.0→jws@3.2.3`).

For an example of a completed report, see `.rebase/1.116/dependency-audit.md` (or the older path `.rebase/reports/dependency-pin-audit-1.116.md`).

#### Step 5 — Present to the user

Present the report to the user and ask for confirmation before making any changes. Group recommendations:
- **Remove** — pins where upstream now has the dependency at equal or higher version (was in `add` but should no longer be)
- **Move to override** — pins where upstream now has the dependency but at a lower version (e.g. CVE fix)
- **Keep** — pins for dependencies that upstream still doesn't have
- **Needs investigation** — pins where the situation is unclear

#### Step 6 — Apply approved changes

After user confirmation:
1. Remove approved pins from `.rebase/add/` and `.rebase/override/` files
2. Move approved pins to `.rebase/override/` files (create or update the override file)
3. **Delete empty files** — if removing all pins from a `.rebase/add/` file leaves it as `{}`, delete the file entirely rather than keeping an empty JSON object. An empty `{}` is a no-op merge that clutters the rebase rules.
4. **Remove stale `rebase.sh` elif entries** — when deleting a `.rebase/add/` or `.rebase/override/` file, check whether the corresponding `code/` file path has an `elif` entry in the `resolve_conflicts()` function of `rebase.sh`. If the file no longer has **any** rebase rules (no add, no override, no replace), remove its `elif` entry. Files with no Che-specific rules are handled correctly by the smart fallback in the `else` branch. Leaving stale entries causes `override_json_file()` to fail when no `.tmp` file is created.
5. **Update `code/` files — restore upstream values, do NOT delete:**

   **Critical:** Removing a pin from `.rebase/add/` or `.rebase/override/` does NOT mean deleting the entry from the corresponding `code/` file. This applies to **every section** — `dependencies`, `devDependencies`, `overrides`, or any other. For each removed entry, check the upstream file:

   - If the entry **exists in the upstream file** (in any section — dependencies, devDependencies, overrides, etc.): the `code/` file entry must be **restored to the upstream value**, not deleted. Removing the rule means "stop overriding upstream's value" — upstream's value should remain.
   - If the entry is **Che-specific** (doesn't exist in the upstream file at all): only then does removing the rule mean deleting the entry from `code/`.

   Example: if `.rebase/add/code/package.json` had `"@types/ws": "8.2.0"` in `devDependencies` and upstream has `"@types/ws": "^8.18.1"` in `devDependencies`, removing the add rule means the `code/package.json` entry should become `"@types/ws": "^8.18.1"` (upstream's version), NOT be deleted.

   To verify, check the upstream file for each removed entry:
   ```bash
   git show upstream-code/release/<version>:<path-without-code-prefix> | jq '.<section>["<pkg>"]'
   ```

   Do this for **every** removed entry, not just overrides — the entry could be in any section.

6. Verify lock file stability (see Package-lock.json Handling below)
7. Record all changes in the report

## Handling npm EOVERRIDE Conflicts

npm requires that overrides for direct dependencies use the exact same version spec. If a Che override pin (e.g. `overrides.tar: "^7.5.11"`) conflicts with an upstream direct dependency (e.g. `devDependencies.tar: "^7.5.9"`):

1. **Do NOT downgrade the override** — it exists for a reason (usually a CVE fix)
2. Add the override version to `.rebase/override/` for the matching dependency section (e.g. `devDependencies.tar: "^7.5.11"` in `.rebase/override/code/package.json`)
3. This ensures both the direct dependency and the override use the same version
4. Always ask the user before making this change

## Package-lock.json Handling

### During rebase

`rebase.sh` handles `package-lock.json` conflicts automatically via `resolve_package_lock()`:
1. Takes the upstream lock file (`git checkout --theirs`)
2. Runs `npm install --ignore-scripts --prefix <dir>` to regenerate it based on the resolved `package.json`
3. Stages the result

Lock files are processed in a **second pass** after all `package.json` files are resolved, ensuring `npm install` sees the correct merged dependencies.

### Critical rule: lock files must be stable after rebase

After `rebase.sh` completes, running `npm install` in any directory that has a `package-lock.json` should produce **no changes** to that lock file. If it does, it means the lock file committed during rebase is inconsistent with the `package.json`.

**Common causes of unstable lock files:**

1. **Redundant override pins** — A pin in `.rebase/add/` forces a version that conflicts with what `npm install` resolves naturally. When the pin is removed (because upstream already satisfies it), `npm install` produces a different lock file. Fix: remove the redundant pin.
2. **Missing `npm install` during rebase** — The `resolve_package_lock()` function must run for every lock file whose corresponding `package.json` was modified by Che rules. If it doesn't run (e.g. because the lock file didn't have a merge conflict), the lock file may be stale.
3. **Node.js version mismatch** — `npm install` produces different lock file content with different Node.js versions. Always use the Node.js version specified in `code/.nvmrc`.

### Verification step

After rebase completes and before committing, verify lock file stability for every directory that has Che package.json modifications:

```bash
# For each directory with .rebase/add/code/<dir>/package.json or .rebase/override/code/<dir>/package.json:
cd code/<dir>
npm install --ignore-scripts
git diff --name-only  # Should show no changes to package-lock.json
```

If `package-lock.json` shows changes, investigate which dependency pin in `.rebase/add/` or `.rebase/override/` is causing the inconsistency, and resolve it (usually by removing a redundant pin).

## Integration with Other Skills

### rebase skill (Phase 1, after Step 3)

After running `pre-rebase.sh` and before validating rules, run the dependency pin audit described above. Include the results in the pre-rebase report. Ask the user to confirm which pins to remove/update before proceeding.

### validate-rebase-rules skill

When validating `.rebase/add/` and `.rebase/override/` rules for `package.json` files, include the dependency pin audit as part of the validation. Report REDUNDANT and OUTDATED pins as findings.

### add-rebase-rules skill

When creating new dependency pins, always document the reason (CVE number, compatibility issue) in the commit message. This helps future rebases understand why the pin exists.

### fix-rebase-rules skill

When fixing rules, never change dependency versions without asking the user. If a version conflict is discovered, report it and propose a fix, but wait for user confirmation.
