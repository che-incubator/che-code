# Post-Rebase Verification Report

**Date:** 2026-10-31
**Previous upstream:** release/1.128
**Current upstream:** release/1.143
**Mode:** dry-run

## Summary

| Metric | Count |
|--------|-------|
| Files changed in upstream | 9946 |
| Files checked (no rules) | 9508 |
| Files fixed (auto-resolution errors) | 2 |
| Skipped (have Che-specific rules) | 68 |
| Skipped (package-lock.json) | 33 |
| Skipped (deleted in upstream) | 337 |
| Kept after upstream deletion | 0 |
| Missing after upstream change | 0 |

## Detected Mismatches

- `code/src/vs/editor/common/standalone/standaloneEnums.ts`
- `code/src/vs/workbench/services/dialogs/browser/abstractFileDialogService.ts`

## Diffs

### `code/src/vs/editor/common/standalone/standaloneEnums.ts`

```diff
1022c1022
< }
\ No newline at end of file
---
> }
```

### `code/src/vs/workbench/services/dialogs/browser/abstractFileDialogService.ts`

```diff
180a181,182
> 			// Disabled for this release to unblock smoke tests
> 			return true;
```

## Decisions

| File | Decision | Reason | Source commit | Fix commit |
|------|----------|--------|---------------|------------|
| `code/src/vs/editor/common/standalone/standaloneEnums.ts` | align with upstream | Trailing newline added during an old rebase merge, no Che intent | [7fc4493771d7](https://github.com/che-incubator/che-code/commit/7fc4493771d7) | [76062350abd](https://github.com/che-incubator/che-code/commit/76062350abd) |
| `code/src/vs/workbench/services/dialogs/browser/abstractFileDialogService.ts` | align with upstream | "Disabled for this release to unblock smoke tests" early return was an upstream release/1.104-only hotfix, carried along by the 1.104 rebase; absent upstream since 1.108 | [1e3b3dddc45](https://github.com/che-incubator/che-code/commit/1e3b3dddc45) | [76062350abd](https://github.com/che-incubator/che-code/commit/76062350abd) |

Re-run after the fix: 0 mismatches, 0 files kept after upstream deletion, 0 files missing after upstream change.
