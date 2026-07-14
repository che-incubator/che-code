# Dependency Version Audit: `.rebase/` → upstream release/1.128

**Date:** 2026-07-14  
**Target upstream:** `release/1.128`  
**Previous upstream:** `release/1.116`  
**Branch:** `alignment-with-upstream-1-128`

---

## Legend

| Action | Meaning |
|--------|---------|
| **KEEP** | `.rebase/add/` entry — dependency does not exist in upstream; still needed |
| **ACTIVE** | `.rebase/override/` entry — Che pin > upstream; actively overriding |
| **REDUNDANT** | `.rebase/override/` entry — Che pin = upstream; can be removed |
| **OUTDATED** | `.rebase/override/` entry — Che pin < upstream; upstream is newer, remove |
| **KEEP (exception)** | Pinned exception — never change regardless of upstream |

---

## `.rebase/add/` Files

### `code/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| dependencies | `js-yaml` | `^4.1.0` | — | No | **KEEP** | Che-specific dependency |
| devDependencies | `@types/js-yaml` | `^4.0.5` | — | No | **KEEP** | Che-specific dependency |
| devDependencies | `@types/minimatch` | `^3.0.5` | — | No | **KEEP** | Che-specific (exists in build/ but not root) |
| overrides | `@gulp-sourcemaps/identity-map → postcss` | `8.4.33` | — | No | **KEEP** | CVE fix for transitive postcss |
| overrides | `tar` | `^7.5.11` | — | No | **KEEP** | CVE fix (override, not same as devDep) |
| overrides | `micromatch` | `4.0.8` | — | No | **KEEP** | CVE fix |
| overrides | `braces` | `3.0.3` | — | No | **KEEP** | CVE fix |
| overrides | `lodash` | `^4.18.1` | — | No | **KEEP** | CVE fix |
| overrides | `es5-ext` | `npm:@unes/es5-ext@0.10.64-1` | — | No | **KEEP** | CVE fix (package swap) |
| overrides | `flatted` | `^3.4.2` | — | No | **KEEP** | CVE fix |
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `qs` | `6.15.2` | — | No | **KEEP** | CVE fix |
| overrides | `ip-address` | `^10.2.0` | — | No | **KEEP** | CVE fix |
| overrides | `webdriver → undici@6` | `^6.27.0` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `test-exclude → brace-expansion@5` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `form-data@3` | `^3.0.5` | — | No | **KEEP** | CVE fix |
| overrides | `form-data@4` | `^4.0.6` | — | No | **KEEP** | CVE fix |
| overrides | `axios → form-data` | `^4.0.6` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `@types/node-fetch → form-data` | `^3.0.5` | — | No | **KEEP** | CVE fix (scoped) |

### `code/remote/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| dependencies | `js-yaml` | `^4.1.0` | — | No | **KEEP** | Che-specific (K8s config parsing) |
| dependencies | `@kubernetes/client-node` | `^1.4.0` | — | No | **KEEP** | Che-specific (K8s integration) |
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `ip-address` | `^10.2.0` | — | No | **KEEP** | CVE fix |
| overrides | `undici` | `^7.28.0` | — | No | **KEEP** | CVE fix |
| overrides | `@types/node-fetch → form-data` | `^4.0.6` | — | No | **KEEP** | CVE fix (scoped) |

### `code/build/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `lodash` | `^4.18.1` | — | No | **KEEP** | CVE fix |
| overrides | `qs` | `6.15.2` | — | No | **KEEP** | CVE fix |
| overrides | `@vscode/vsce → brace-expansion` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `@vscode/vsce → form-data` | `^4.0.6` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `form-data@4` | `^4.0.6` | — | No | **KEEP** | CVE fix |

### `code/build/rspack/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `qs` | `6.15.2` | — | No | **KEEP** | CVE fix |
| overrides | `ws` | `^8.21.0` | — | No | **KEEP** | CVE fix |
| overrides | `webpack-bundle-analyzer → ws` | `^7.5.11` | — | No | **KEEP** | CVE fix (scoped) |

### `code/build/npm/gyp/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `ip-address` | `^10.2.0` | — | No | **KEEP** | CVE fix |

### `code/extensions/copilot/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `qs` | `6.15.2` | — | No | **KEEP** | CVE fix |
| overrides | `ip-address` | `^10.2.0` | — | No | **KEEP** | CVE fix |
| overrides | `ws` | `^8.21.0` | — | No | **KEEP** | CVE fix |
| overrides | `webdriver → undici@6` | `^6.27.0` | — | No | **KEEP** | CVE fix (scoped) |
| overrides | `brace-expansion@5` | `5.0.7` | — | No | **KEEP** | CVE fix |
| overrides | `form-data@4` | `^4.0.6` | — | No | **KEEP** | CVE fix |
| overrides | `@vscode/vsce → form-data` | `^4.0.6` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/copilot/chat-lib/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `minimatch@10 → brace-expansion` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/css-language-features/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `minimatch → brace-expansion` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/github-authentication/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `@types/node-fetch → form-data` | `^3.0.5` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/html-language-features/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `minimatch → brace-expansion` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/json-language-features/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `minimatch → brace-expansion` | `5.0.7` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/microsoft-authentication/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| workspaces | `packageMocks/keytar` | (workspace entry) | — | No | **KEEP** | Che workspace config for keytar mock |
| overrides | `@types/node-fetch → form-data` | `^3.0.5` | — | No | **KEEP** | CVE fix (scoped) |

### `code/extensions/notebook-renderers/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `undici` | `^7.28.0` | — | No | **KEEP** | CVE fix |

### `code/extensions/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| devDependencies | `crypto` | `1.0.1` | — | No | **KEEP** | Che-specific dependency |

### `code/test/smoke/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `@types/node-fetch → form-data` | `^3.0.5` | — | No | **KEEP** | CVE fix (scoped) |

### `code/test/mcp/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |
| overrides | `qs` | `6.15.2` | — | No | **KEEP** | CVE fix |
| overrides | `ip-address` | `^10.2.0` | — | No | **KEEP** | CVE fix |
| overrides | `@types/node-fetch → form-data` | `^4.0.6` | — | No | **KEEP** | CVE fix (scoped) |

### `code/test/monaco/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `lodash` | `^4.18.1` | — | No | **KEEP** | CVE fix |

### `code/test/automation/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | In Upstream? | Action | Reason |
|---------|-----------|---------|-----------------|--------------|--------|--------|
| overrides | `shell-quote` | `^1.8.4` | — | No | **KEEP** | CVE fix |

---

## `.rebase/override/` Files

### `code/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `ws` | `^8.21.0` | `^8.19.0` | **ACTIVE** | Che minimum (8.21.0) > upstream (8.19.0); CVE fix |
| dependencies | `undici` | `^7.28.0` | `^7.28.0` | **REDUNDANT** | Identical to upstream; override no longer needed |
| devDependencies | `@vscode/l10n-dev` | `0.0.18` | `0.0.35` | **KEEP (exception)** | Pinned exception — intentionally held back |
| devDependencies | `@vscode/test-cli` | `^0.0.12` | `^0.0.6` | **ACTIVE** | Che minimum (0.0.12) > upstream (0.0.6) |
| devDependencies | `@vscode/test-web` | `^0.0.77` | `^0.0.81` | **OUTDATED** | Upstream (0.0.81) > Che (0.0.77); remove |
| devDependencies | `eslint` | `^9.39.3` | `^9.36.0` | **ACTIVE** | Che minimum (9.39.3) > upstream (9.36.0) |
| devDependencies | `tar` | `^7.5.11` | `^7.5.16` | **OUTDATED** | Upstream (7.5.16) > Che (7.5.11); remove |
| overrides | `chrome-remote-interface → ws` | `^7.5.11` | — (not in upstream) | **ACTIVE** | CVE fix; new override not present upstream |

### `code/remote/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `ws` | `^8.21.0` | `^8.19.0` | **ACTIVE** | Che minimum (8.21.0) > upstream (8.19.0); CVE fix |

### `code/build/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| devDependencies | `@types/minimatch` | `^3.0.5` | `^3.0.3` | **ACTIVE** | Che minimum (3.0.5) > upstream (3.0.3) |

### `code/build/vite/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| devDependencies | `vite` | `7.3.1` | `npm:rolldown-vite@latest` | **ACTIVE** | Upstream uses rolldown-vite alias; Che pins standard vite |

### `code/extensions/copilot/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `undici` | `^7.28.0` | `^7.24.1` | **ACTIVE** | Che minimum (7.28.0) > upstream (7.24.1); CVE fix |
| devDependencies | `@vitest/coverage-v8` | `^3.2.6` | `^4.1.8` | **OUTDATED** | Upstream (4.1.8) > Che (3.2.6); remove |
| devDependencies | `vitest` | `^3.2.6` | `^4.1.8` | **OUTDATED** | Upstream (4.1.8) > Che (3.2.6); remove |

### `code/extensions/copilot/chat-lib/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `undici` | `^7.28.0` | `^7.24.1` | **ACTIVE** | Che minimum (7.28.0) > upstream (7.24.1); CVE fix |
| devDependencies | `vitest` | `^3.2.6` | `^4.1.8` | **OUTDATED** | Upstream (4.1.8) > Che (3.2.6); remove |

### `code/extensions/github-authentication/package.json`

| Section | Entry | Che Value | Upstream (1.128) | Action | Reason |
|---------|-------|-----------|-----------------|--------|--------|
| activationEvents | `*` | `["*"]` | (not present) | **N/A** | Not a dependency pin; activation event override |

### `code/extensions/microsoft-authentication/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `keytar` | `workspace:*` | `file:./packageMocks/keytar` | **ACTIVE** | Che uses workspace protocol vs upstream file: reference |

### `code/extensions/npm/package.json`

| Section | Dependency | Che Pin | Upstream (1.128) | Action | Reason |
|---------|-----------|---------|-----------------|--------|--------|
| dependencies | `minimatch` | `^5.1.9` | `^5.1.8` | **ACTIVE** | Che minimum (5.1.9) > upstream (5.1.8) |

### Missing Files (listed by glob but not on disk)

- `.rebase/override/code/extensions/markdown-language-features/package.json` — **does not exist**
- `.rebase/override/code/extensions/mermaid-chat-features/package.json` — **does not exist**

These may have been removed previously but still appeared in a stale glob index. No action needed.

---

## Summary by Action

### REMOVE — 6 entries

These overrides are no longer needed and should be deleted from their respective `.rebase/override/` files:

| File | Dependency | Che Pin | Upstream | Reason |
|------|-----------|---------|----------|--------|
| `override/code/package.json` | `undici` (dep) | `^7.28.0` | `^7.28.0` | REDUNDANT — identical |
| `override/code/package.json` | `@vscode/test-web` (devDep) | `^0.0.77` | `^0.0.81` | OUTDATED — upstream newer |
| `override/code/package.json` | `tar` (devDep) | `^7.5.11` | `^7.5.16` | OUTDATED — upstream newer |
| `override/code/extensions/copilot/package.json` | `@vitest/coverage-v8` (devDep) | `^3.2.6` | `^4.1.8` | OUTDATED — upstream newer |
| `override/code/extensions/copilot/package.json` | `vitest` (devDep) | `^3.2.6` | `^4.1.8` | OUTDATED — upstream newer |
| `override/code/extensions/copilot/chat-lib/package.json` | `vitest` (devDep) | `^3.2.6` | `^4.1.8` | OUTDATED — upstream newer |

### KEEP — 73 entries

| Category | Count | Details |
|----------|-------|---------|
| `.rebase/add/` (not in upstream) | 61 | All add-file entries: CVE overrides + Che-specific deps |
| `.rebase/override/` ACTIVE | 11 | Che pin > upstream — still actively needed |
| Pinned exception | 1 | `@vscode/l10n-dev` held at `0.0.18` |

### ACTIVE overrides (Che > upstream) — 11 entries

| File | Dependency | Che Pin | Upstream |
|------|-----------|---------|----------|
| `override/code/package.json` | `ws` (dep) | `^8.21.0` | `^8.19.0` |
| `override/code/package.json` | `@vscode/test-cli` (devDep) | `^0.0.12` | `^0.0.6` |
| `override/code/package.json` | `eslint` (devDep) | `^9.39.3` | `^9.36.0` |
| `override/code/package.json` | `chrome-remote-interface → ws` (override) | `^7.5.11` | — |
| `override/code/remote/package.json` | `ws` (dep) | `^8.21.0` | `^8.19.0` |
| `override/code/build/package.json` | `@types/minimatch` (devDep) | `^3.0.5` | `^3.0.3` |
| `override/code/build/vite/package.json` | `vite` (devDep) | `7.3.1` | `npm:rolldown-vite@latest` |
| `override/code/extensions/copilot/package.json` | `undici` (dep) | `^7.28.0` | `^7.24.1` |
| `override/code/extensions/copilot/chat-lib/package.json` | `undici` (dep) | `^7.28.0` | `^7.24.1` |
| `override/code/extensions/microsoft-authentication/package.json` | `keytar` (dep) | `workspace:*` | `file:./packageMocks/keytar` |
| `override/code/extensions/npm/package.json` | `minimatch` (dep) | `^5.1.9` | `^5.1.8` |

### Non-dependency override — 1 entry

| File | Entry | Note |
|------|-------|------|
| `override/code/extensions/github-authentication/package.json` | `activationEvents: ["*"]` | Not a dependency pin; reviewed separately |

---

## Recommended Follow-up

1. **Remove 6 entries** from `.rebase/override/` files (1 REDUNDANT + 5 OUTDATED)
2. **Verify CVE overrides** in `.rebase/add/` are still needed — some CVEs may have been fixed in newer transitive dependency versions pulled by upstream 1.128
3. **Review `vite` pin** (`7.3.1`) — upstream switched to `npm:rolldown-vite@latest`; confirm Che deliberately needs standard vite
4. **Review `@vscode/l10n-dev`** exception — still intentionally held at `0.0.18` while upstream is at `0.0.35`
