# Rebase Rules Validation Report

> Generated against upstream `release/1.108` (previous: `release/1.104`)
> che-code `code/` directory is at version **1.108.2** (rebase already applied)

## Critical findings

1. **`server-main.js` rule targets a removed file** — The file was renamed to `server-main.ts` in upstream. The rule file and `rebase.sh` reference need updating.

2. **15 replace rules have stale `from` values** — These patterns don't exist in upstream at `release/1.108` or `release/1.104`, meaning the rebase script would fail. Files affected include `workbench.html` (7 entries), `product.ts`, `browserSocketFactory.ts`, `chatActions.ts`, `remote.ts`, `titlebarPart.ts`, `workbench.contribution.ts`, and more.

3. **2 replace rules with upstream drift** — `extensionGalleryService.ts` and `web.main.ts` have `from` values that existed at `release/1.104` but changed at `release/1.108`.

4. **`product.json` add rule conflict** — The `builtInExtensions[0]` add rule collides with upstream's first array entry, silently overriding `ms-vscode.js-debug-companion` instead of adding a new entry.

5. **`@vscode/l10n-dev` override is outdated** — Upstream is now at `0.0.35`, exceeding the override value of `0.0.18`.

6. **Redundant `trustedExtensionAuthAccess` overrides** — `GitHub.copilot-chat` entries for `github` and `github-enterprise` already exist in upstream.

---

## Replace Rules

### File not found in upstream

The following rule targets a file that does not exist in upstream at either `release/1.108` or `release/1.104`. The file was likely renamed or removed.

| Rule file | Issue |
|-----------|-------|
| `.rebase/replace/code/src/server-main.js.json` | **ERROR** — `src/server-main.js` not found in upstream. File was renamed to `src/server-main.ts` |

### `from` not found in upstream (rule will fail during rebase)

These rules have `from` values that no longer match the upstream code. They will cause the rebase script to exit with an error.

| Rule file | Entry | Issue |
|-----------|-------|-------|
| `.rebase/replace/code/src/vs/platform/product/common/product.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/platform/product/common/product.ts.json` | 1 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/platform/extensionManagement/common/extensionGalleryService.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` but was present at `release/1.104` — upstream code changed |
| `.rebase/replace/code/src/vs/platform/extensionManagement/node/extensionManagementService.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/platform/remote/browser/browserSocketFactory.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/code/browser/workbench/workbench.html.json` | 0, 1, 2, 3, 5, 7, 8 | **ERROR** — 7 entries have `from` not found at either version — rule may be stale |
| `.rebase/replace/code/src/vs/code/browser/workbench/workbench.ts.json` | 1 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/server/node/webClientServer.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/contrib/chat/browser/actions/chatActions.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/contrib/webview/browser/pre/index.html.json` | 0, 2 | **ERROR** — `from` not found at either version — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts.json` | 4 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/contrib/remote/browser/remote.ts.json` | 0, 2 | **ERROR** — `from` not found at either version — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/browser/web.main.ts.json` | 1 | **ERROR** — `from` not found at `release/1.108` but was present at `release/1.104` — upstream changed |
| `.rebase/replace/code/src/vs/workbench/browser/workbench.contribution.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |
| `.rebase/replace/code/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts.json` | 0 | **ERROR** — `from` not found at `release/1.108` or `release/1.104` — rule may be stale |

### `by` not found in che-code (replacement not applied)

These rules have `by` values that are not present in the current che-code working tree. The replacement may not have been applied, or the code was subsequently modified.

| Rule file | Entry | Notes |
|-----------|-------|-------|
| `.rebase/replace/code/extensions/git/src/ssh-askpass.sh.json` | 0 | |
| `.rebase/replace/code/build/lib/mangle/index.ts.json` | 0, 1 | |
| `.rebase/replace/code/src/vs/platform/product/common/product.ts.json` | 0, 1 | Also has `from` mismatch (see above) |
| `.rebase/replace/code/src/vs/platform/extensionManagement/common/extensionGalleryService.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/platform/extensionManagement/node/extensionManagementService.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/code/browser/workbench/workbench.html.json` | 0, 1, 2, 3, 6, 8 | Multiple entries; most also have `from` mismatch |
| `.rebase/replace/code/src/vs/code/browser/workbench/workbench.ts.json` | 0, 1, 2 | Entry 1 also has `from` mismatch |
| `.rebase/replace/code/src/vs/server/node/remoteExtensionHostAgentServer.ts.json` | 0 | |
| `.rebase/replace/code/src/vs/server/node/serverEnvironmentService.ts.json` | 1 | |
| `.rebase/replace/code/src/vs/server/node/webClientServer.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/contrib/chat/browser/actions/chatActions.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/contrib/webview/browser/pre/index.html.json` | 0, 2 | Also have `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts.json` | 0 | |
| `.rebase/replace/code/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts.json` | 0, 1 | |
| `.rebase/replace/code/src/vs/workbench/contrib/remote/browser/remote.ts.json` | 0, 2 | Also have `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/browser/workbench.contribution.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts.json` | 0 | Also has `from` mismatch |
| `.rebase/replace/code/src/vs/workbench/browser/parts/titlebar/windowTitle.ts.json` | 1 | |

## Add Rules

| Rule file | Key | Issue |
|-----------|-----|-------|
| `.rebase/add/code/product.json` | `builtInExtensions[0].name` | **WARNING** — Silently overrides upstream (`ms-vscode.js-debug-companion` → `devfile.vscode-devfile`) |
| `.rebase/add/code/product.json` | `builtInExtensions[0].version` | **WARNING** — Silently overrides upstream (`1.1.3` → `0.0.4`) — upstream version >= add-rule (possible downgrade) |
| `.rebase/add/code/product.json` | `builtInExtensions[0].sha256` | **WARNING** — Silently overrides upstream (different hash) |
| `.rebase/add/code/product.json` | `builtInExtensions[0].repo` | **WARNING** — Silently overrides upstream (different repo URL) |
| `.rebase/add/code/product.json` | `builtInExtensions[0].name` | **ERROR** — Value differs in che-code: expected `devfile.vscode-devfile`, got `ms-vscode.js-debug-companion` |
| `.rebase/add/code/product.json` | `builtInExtensions[0].version` | **ERROR** — Value differs in che-code: expected `0.0.4`, got `1.1.3` |
| `.rebase/add/code/product.json` | `builtInExtensions[0].sha256` | **ERROR** — Value differs in che-code: expected add-rule hash, got upstream hash |
| `.rebase/add/code/product.json` | `builtInExtensions[0].repo` | **ERROR** — Value differs in che-code: expected add-rule repo, got upstream repo |

> **Note:** The `builtInExtensions` add rule uses array position `[0]`, which collides with the upstream first entry. The `jq` merge (`.[1] * .[0]`) replaces array elements by index, so the add rule would overwrite the first upstream entry rather than prepending. This rule is not being applied correctly in the current working tree.

## Override Rules

| Rule file | Key | Issue |
|-----------|-----|-------|
| `.rebase/override/code/package.json` | `bin` | **WARNING** — Key missing from upstream (intentional addition via override) |
| `.rebase/override/code/package.json` | `devDependencies.@vscode/l10n-dev` | **WARNING** — Upstream already at `0.0.35` which is >= override `0.0.18` — override may be unnecessary |
| `.rebase/override/code/product.json` | `extensionEnabledApiProposals.genuitecllc.codetogether[0..6]` | **WARNING** — Key missing from upstream (`genuitecllc.codetogether` not in upstream `extensionEnabledApiProposals`) — this is intentional Che-specific config |
| `.rebase/override/code/product.json` | `trustedExtensionAuthAccess.github[0]` | **WARNING** — Override is redundant (upstream already has `GitHub.copilot-chat`) |
| `.rebase/override/code/product.json` | `trustedExtensionAuthAccess.github[1]` | **WARNING** — Key missing from upstream (array position doesn't exist) |
| `.rebase/override/code/product.json` | `trustedExtensionAuthAccess.github-enterprise[0]` | **WARNING** — Override is redundant (upstream already has `GitHub.copilot-chat`) |
| `.rebase/override/code/product.json` | `trustedExtensionAuthAccess.github-enterprise[1]` | **WARNING** — Key missing from upstream (array position doesn't exist) |

## Summary

| Category | Files checked | Errors | Warnings | Info |
|----------|--------------|--------|----------|------|
| Replace | 35 | 54 | 0 | 1 |
| Add | 18 | 4 | 4 | 0 |
| Override | 5 | 0 | 13 | 0 |
| **Total** | **58** | **58** | **17** | **1** |

### Key action items

1. **`server-main.js` → `server-main.ts`**: Rule file targets a removed/renamed file. Update to `.rebase/replace/code/src/server-main.ts.json` and adjust `rebase.sh` accordingly.

2. **15 replace rules with stale `from` values**: These will cause the rebase script to fail. The upstream code has changed and the `from` patterns need to be updated to match the current upstream at `release/1.108`.

3. **2 replace rules with upstream drift**: `extensionGalleryService.ts` entry 0 and `web.main.ts` entry 1 had their `from` values present at `release/1.104` but changed at `release/1.108`. These need updated `from` values.

4. **`product.json` add rule for `builtInExtensions[0]`**: The array-index-based merge collides with upstream's first entry. Consider restructuring this rule.

5. **`@vscode/l10n-dev` override**: Upstream version (`0.0.35`) now exceeds the override value (`0.0.18`). This override can be removed.

6. **Redundant `trustedExtensionAuthAccess` overrides**: `github[0]` and `github-enterprise[0]` entries (`GitHub.copilot-chat`) are already in upstream and can be removed from the override.
