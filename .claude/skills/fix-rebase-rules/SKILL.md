---
name: fix-rebase-rules
description: Validates and fixes existing .rebase/replace/ rules and rebase.sh routing. Use when asked to check, verify, or fix rebasing rules for a file, or when rebase rules are suspected to be outdated or broken.
---

# Fix Rebase Rules

Validate and repair existing `.rebase/replace/` rule files and `rebase.sh` routing for Che-specific changes that touch VS Code subtree files.

## Required input

- A file path under `code/` (the file whose rebase rules need checking).
- Optionally, commit SHAs that introduced the Che-specific changes (for context on intent).

## Workflow

### 1. Gather current state

Run these in parallel:
- Read the existing rule file at `.rebase/replace/<filepath>.json`
- Get the full diff: `diff <(git show <upstream-ref>:<path-without-code-prefix>) <filepath>`
- Check routing in `rebase.sh`: grep for the file path

Determine the upstream ref from `rebase.sh`:
```bash
grep UPSTREAM_VERSION rebase.sh
# e.g. UPSTREAM_VERSION=$(git rev-parse upstream-code/release/1.108)
```

### 2. Test existing rules (dry-run)

For **sed-based** rules (used by `apply_replace` / `apply_changes`):
```bash
escape_litteral() {
    escaped=${1//\$/\\$}
    escaped=${escaped//\[/\\[}
    escaped=${escaped//\]/\\]}
    echo "$escaped"
}
# Then for each rule: jq to extract from/by, escape, sed replace, check diff
```

For **perl-based multiline** rules (used by `apply_multi_line_replace` / `apply_changes_multi_line`):
```bash
REPLACE_FROM="$from" REPLACE_BY="$by" perl -0777 -pe \
  'BEGIN { $from = $ENV{"REPLACE_FROM"}; $by = $ENV{"REPLACE_BY"}; } s|\Q$from\E|$by|g' \
  "$file.bak" > "$file"
```

### 3. Identify failures

Common reasons rules break:

| Symptom | Root cause |
|---------|-----------|
| `from` not found in upstream | Upstream refactored the code (renamed, moved, rewritten) |
| Import path mismatch | Upstream migrated from `'vs/...'` to relative `'../...'` + `.js` extensions |
| Type cast changed | e.g. `as any` → `as unknown as IProductConfiguration` |
| Missing `type="module"` | Upstream added attributes to script tags |
| File renamed | e.g. `.js` → `.ts` |
| Missing rules | New Che changes were committed without creating rules |
| No routing in `rebase.sh` | File was never added to `resolve_conflicts` |

### 4. Choose the right handler

| Scenario | Handler | Rule format |
|----------|---------|-------------|
| Single-line replacements only, no blank-line changes | `apply_changes` (sed) | `\\\n` for newlines, `\\\t` for tabs, `\\&` for `&` in `by` |
| Multiline from/by, blank-line insertions/removals, cross-line changes | `apply_changes_multi_line` (perl) | Literal `\n`/`\t` in JSON (jq resolves them) |
| JSON file merges (package.json) | `apply_package_changes_by_path` | Use `.rebase/add/` and `.rebase/override/` |

#### When to use multiline (perl) over sed:
- The `from` spans multiple lines
- Need to remove/add blank lines between code
- The replacement includes `&` characters without wanting sed's "matched text" behavior
- The `from` or `by` ends with newlines (shell `$()` strips trailing newlines — only affects sed path since perl reads from env vars the same way, but multiline from patterns that don't end with newlines avoid the issue)

### 5. Encoding rules

#### Sed-based (`apply_replace` / `apply_changes`)

In the JSON file, values go through: JSON parse → jq -r → escape_litteral → sed.

| Character in target | JSON encoding in `from` | JSON encoding in `by` |
|---------------------|------------------------|----------------------|
| Newline | `\\\n` (sed: `\<newline>` matches nothing in from, inserts newline in by) | `\\\n` |
| Tab | `\\\t` | `\\\t` |
| `&` | literal `&` (not special in sed pattern) | `\\&` (escaped for sed replacement) |
| `*` | `\\*` (escaped for sed BRE regex) | literal `*` |
| `$` | literal (escape_litteral handles it) | literal (escape_litteral handles it) |
| `[` / `]` | literal (escape_litteral handles them) | literal (escape_litteral handles them) |
| `"` | `\\\"` (convention in this repo, works because sed treats `\"` as `"`) | `\\\"` |
| `|` | literal (not special — it's the sed delimiter but appears inside variables) | literal |
| `.` | literal (technically matches any char in BRE, but works for unique patterns) | literal |

#### Perl-based multiline (`apply_multi_line_replace` / `apply_changes_multi_line`)

In JSON, values go through: JSON parse → jq -r → env var → perl `\Q\E` (from) / literal (by).

| Character in target | JSON encoding in `from` | JSON encoding in `by` |
|---------------------|------------------------|----------------------|
| Newline | `\n` | `\n` |
| Tab | `\t` | `\t` |
| Any special char | literal (perl `\Q\E` quotes everything) | literal |
| `$`, `&`, `|`, `*` | literal | literal |

**Key advantage**: No manual escaping needed. Perl's `\Q...\E` handles the pattern, and `$by` as a perl variable doesn't re-interpolate its contents.

**Key constraint**: Shell `$()` strips trailing newlines. Ensure `from`/`by` values don't end with `\n` — include following non-whitespace text as anchor.

### 6. Fix the rules

- Update `from` patterns to match current upstream content
- Update `by` patterns to produce the current Che file content
- Add missing rules for Che changes that have no rule
- Remove rules for changes that are now upstream (no longer Che-specific)

### 7. Fix routing in `rebase.sh`

- If the file has no `elif` branch in `resolve_conflicts`, add one
- Use the appropriate handler (`apply_changes`, `apply_changes_multi_line`, etc.)
- Remove redundant dedicated functions that duplicate `apply_changes` logic (just checkout theirs + apply_replace + git add)
- If switching from sed to multiline, change the handler call accordingly

### 8. Validate

1. `jq empty <rule-file>` — JSON syntax
2. `bash -n rebase.sh` — shell syntax
3. Dry-run the replacement against upstream and diff with the Che file:
   ```bash
   git show <upstream-ref>:<path-without-code-prefix> > /tmp/test-file
   # Apply rules (sed or perl depending on handler)
   diff /tmp/test-file <che-filepath>
   # Should produce empty output (exact match)
   ```
4. If file was renamed, verify old rule file is deleted and old routing removed

## Decision guidance

- **Prefer multiline (perl)** for new/rewritten rules — simpler encoding, handles all cases
- **Keep sed** if existing rules work and only need minor `from`/`by` text updates
- **Combine related rules** — if two sed rules operate on adjacent lines (e.g., delete line N, modify line N+1), a single multiline rule is cleaner
- **Smallest safe snippet** — use the minimum unique text in `from` that won't accidentally match elsewhere, but include enough context to be stable across upstream changes
