---
name: test-rebase-rules
description: Tests rebase rules by running actual rebase.sh functions against upstream content and comparing with the expected che-code result. Use when asked to test rebase rules, verify rebase rules work correctly, or after fixing rebase rules.
---

# Test Rebase Rules

End-to-end test that runs the **actual** `rebase.sh` handler functions against upstream file content and verifies the output matches the expected che-code result.

## Prerequisites

Ensure the `upstream-code` remote exists and is fetched:

```bash
git remote get-url upstream-code || git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code
```

## Input

The user specifies one or more files under `code/` to test (e.g. `code/product.json`). If no file is specified, test all files that have rebase rules.

## Step 1 — Resolve upstream version

Read `rebase.sh` and extract `CURRENT_UPSTREAM_VERSION` (e.g. `release/1.108`).

## Step 2 — Identify the handler function

Read the `resolve_conflicts` function in `rebase.sh` to find which handler is called for the target file. Map it to the actual function name:

| Routing in `resolve_conflicts` | Handler function |
|-------------------------------|-----------------|
| `apply_code_product_changes` | Custom function for `code/product.json` |
| `apply_code_package_changes` | Custom function for `code/package.json` |
| `apply_package_changes_by_path "$conflictingFile"` | Generic JSON override handler |
| `apply_changes "$conflictingFile"` | sed-based replace |
| `apply_changes_multi_line "$conflictingFile"` | perl-based multiline replace |
| Custom `apply_code_*_changes` | File-specific custom function |

## Step 3 — Save expected result

The current che-code working tree file is the expected output. Save it:

```bash
cp <file-path> /tmp/expected-<basename>
```

If the working tree has uncommitted changes to the file, ask the user whether the current content or the committed version is the expected result.

## Step 4 — Place upstream content

Get the upstream file and put it in the working tree (this is what `git checkout --theirs` does during a real rebase):

```bash
git show upstream-code/CURRENT_UPSTREAM_VERSION:<path-without-code-prefix> > <file-path>
```

## Step 5 — Run the actual handler function

Create a test wrapper script that:
1. Stubs `git checkout` and `git add` (they require merge conflict state)
2. Sources `rebase.sh` functions (without executing the trailing calls)
3. Calls the handler function

```bash
cat > /tmp/test-rebase-rules.sh << 'WRAPPER'
#!/bin/bash
set -e
set -u

# Stub git operations that require merge conflict state
git() {
  if [[ "$1" == "checkout" || "$1" == "add" || "$1" == "diff" ]]; then
    return 0
  fi
  command git "$@"
}
export -f git

# Source only the function definitions from rebase.sh (exclude trailing calls).
# Extract everything up to the last function definition boundary.
# We do this by reading rebase.sh and evaluating just the functions.
eval "$(sed -n '1,/^# perform rebase/p' rebase.sh)"

# Call the handler
"$@"
WRAPPER
chmod +x /tmp/test-rebase-rules.sh
```

Run it:

```bash
bash /tmp/test-rebase-rules.sh <handler-function-name> [args...]
```

For example:

```bash
bash /tmp/test-rebase-rules.sh apply_code_product_changes
bash /tmp/test-rebase-rules.sh apply_changes code/src/server-main.ts
bash /tmp/test-rebase-rules.sh apply_changes_multi_line code/src/vs/server/node/webClientServer.ts
```

## Step 6 — Compare result

Diff the handler output against the expected file:

```bash
diff <file-path> /tmp/expected-<basename>
```

### Interpreting results

| Diff result | Meaning |
|-------------|---------|
| Empty diff | Rules produce the exact expected output. **PASS** |
| Only whitespace/trailing newline differences | Cosmetic difference from jq formatting. **PASS** (note it) |
| Missing content in output | Rules don't add something they should. **FAIL** — a rule is missing or broken |
| Extra content in output | Rules add something unexpected. **FAIL** — a rule is wrong or stale |
| Wrong values | Override/add/replace rule has incorrect values. **FAIL** |

## Step 7 — Restore the file

After testing, restore the original file:

```bash
cp /tmp/expected-<basename> <file-path>
```

## Step 8 — Report results

For each tested file, report:

- **PASS** or **FAIL**
- If FAIL: show the diff and identify which rule(s) are responsible
- Suggest running the `fix-rebase-rules` skill for any failures

### Report format

```
## Rebase Rules Test Results

| File | Result | Details |
|------|--------|---------|
| `code/product.json` | PASS | Exact match |
| `code/src/server-main.ts` | FAIL | Missing import on line 12 |
```

## Testing all files

To test all files with rebase rules:

1. List all files in `.rebase/replace/`, `.rebase/add/`, `.rebase/override/`
2. Build a deduplicated list of `code/` file paths
3. For each file, find its handler in `resolve_conflicts`
4. Run Steps 3–7 for each file
5. Produce a combined report

Files can be tested independently — launch parallel subagents when testing multiple files.

## Edge cases

- **Files with multiple rule types** (e.g. `code/package.json` has replace + add + override): the handler already applies all of them in sequence. Just run the handler.
- **Custom handler functions** (e.g. `apply_code_vs_extensions_contribution_changes`): these contain inline perl/sed beyond the JSON rules. The test wrapper runs them as-is, which is the whole point — testing the real code path.
- **`npm install` steps** (e.g. package-lock.json handlers): skip these in testing since they require network access and full node_modules. Warn the user.
