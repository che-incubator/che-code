---
name: test-rebase-rules
description: Tests rebase rules by running actual rebase.sh functions against upstream content and comparing with the expected che-code result. Use when asked to test rebase rules, verify rebase rules work correctly, or after fixing rebase rules.
---

# Test Rebase Rules

End-to-end test that runs the **actual** `rebase.sh` handler functions against upstream file content and verifies the output matches the expected che-code result.

## Scripts

This skill uses two scripts located alongside this file:

- **`test-rebase-handler.sh`** — Wrapper that stubs `git checkout`/`add`/`diff` (they require merge conflict state), sources the function definitions from `rebase.sh`, and calls a specified handler function. Used by the test runner internally.
- **`run-all-tests.sh`** — Master test runner that auto-parses the `resolve_conflicts()` function in `rebase.sh` to discover every file→handler mapping, then tests each one by placing upstream content, running the handler, and diffing against expected output. Restores all files after testing.

## How to run

### Prerequisites

Ensure the `upstream-code` remote exists and is fetched:

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

### Test all files

```bash
bash .claude/skills/test-rebase-rules/run-all-tests.sh
```

### Test specific file(s)

```bash
bash .claude/skills/test-rebase-rules/run-all-tests.sh code/product.json
bash .claude/skills/test-rebase-rules/run-all-tests.sh code/product.json code/src/server-main.ts
```

### Test a single handler manually

```bash
bash .claude/skills/test-rebase-rules/test-rebase-handler.sh apply_code_product_changes
bash .claude/skills/test-rebase-rules/test-rebase-handler.sh apply_changes code/src/server-main.ts
```

## Interpreting results

| Diff result | Meaning |
|-------------|---------|
| Empty diff | Rules produce the exact expected output. **PASS** |
| Only whitespace/trailing newline differences | Cosmetic difference from jq formatting. **PASS** (noted) |
| JSON key ordering or indentation differences | jq `*` merge puts added keys at end of objects, or `override_json_file` uses wrong formatting option. Both are cosmetic — JSON semantics unchanged. **WARN** |
| Missing content in output | Rules don't add something they should. **FAIL** — a rule is missing or broken |
| Extra content in output | Rules add something unexpected. **FAIL** — a rule is wrong or stale |
| Wrong values | Override/add/replace rule has incorrect values. **FAIL** |

When failures occur, diff files are saved at `/tmp/diff-<safe_name>` and error output at `/tmp/error-<safe_name>`.

## Workflow

1. Ensure upstream remote is fetched (see Prerequisites)
2. Run `bash .claude/skills/test-rebase-rules/run-all-tests.sh` (or with specific files)
3. For any **FAIL** results, read the corresponding `/tmp/diff-*` file to identify the root cause
4. Save a report to `.rebase/rebase-rules-test-report.md` (see Report format below)
5. Present the report to the user
6. Suggest running the `fix-rebase-rules` skill for handler/rule failures

## Report format

After running the tests, create `.rebase/rebase-rules-test-report.md` with the following structure:

```markdown
# Rebase Rules Test Report

**Date:** YYYY-MM-DD
**Upstream version:** release/X.YYY (from CURRENT_UPSTREAM_VERSION in rebase.sh)
**Summary:** N passed, N warnings, N failed, N skipped

## Failures

(omit section if count is 0)

| File | Handler | Details |
|------|---------|---------|
| `code/some/file.ts` | apply_changes | Diff: 5 lines |

### `code/some/file.ts`

**Handler:** apply_changes
**Root cause:** <explanation of what the diff shows and which rule is responsible>

\`\`\`diff
<contents of /tmp/diff-* file>
\`\`\`

(repeat for each failure)

## Warnings

(omit section if count is 0)

| File | Details |
|------|---------|
| `code/package.json` | JSON key ordering or indentation |
| `code/some/file.html` | Whitespace or blank line difference |

## Skipped

- `code/extensions/package-lock.json` — Requires npm install

## Passed

- `code/product.json`
- `code/src/server-main.ts`
- ...
```

The report file should be self-contained so it can be reviewed later without re-running the tests.

## Edge cases

- **Package-lock.json handlers** (containing `package_lock` in the name) are automatically skipped — they require `npm install` with network access.
- **Files with `.rebase/` rules** are auto-discovered and tested even if they don't have a dedicated `elif` branch in `resolve_conflicts()`. The parser discovers handlers from the elif chain, `.rebase/replace/` rules, and `.rebase/add/`/`.rebase/override/` package.json files.
- **Custom handler functions** (e.g. `apply_code_vs_extensions_contribution_changes`) with inline perl/sed are tested as-is — the whole point is testing the real code path.
