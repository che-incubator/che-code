# Dependency Pin Audit — release/1.116

**Date:** 2026-04-22
**Target upstream:** release/1.116

## Manual Check Results

All manual checks completed on 2026-04-22 using `npm ls` against a git worktree of `upstream-code/release/1.116` (commit `8ff9a84c4a9`).

### Classification rules applied

- If upstream resolves to a version **>=** the Che pin → **REMOVE** (upstream already satisfies it)
- If upstream resolves to a version **<** the Che pin → **KEEP** (CVE/security fix still needed)
- If the parent package no longer exists in upstream → **REMOVE** (orphaned rule)

### Reference files

- Skill: `.claude/skills/dependency-rebase-rules/SKILL.md`
- Session state: `.rebase/reports/rebase-1.116-session-state.md`
- Review TODO: `rebase-review-todo.md`

---

## .rebase/add/code/package.json

### dependencies

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| ws | 8.2.3 | ^8.19.0 | YES | **REMOVE** | Upstream has higher version. Old pin causes `@types/ws` mismatch that breaks upstream code compilation. |
| js-yaml | ^4.1.0 | (not present) | NO | KEEP | Che-specific dependency |

### devDependencies

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| @types/ws | 8.2.0 | ^8.18.1 | YES | **REMOVE** | Upstream has higher version. Old pin breaks upstream code that uses newer `ClientOptions` API. |
| @types/js-yaml | ^4.0.5 | (not present) | NO | KEEP | Matches Che js-yaml dependency |
| @types/minimatch | ^3.0.5 | (not present) | NO | KEEP | Che-specific |

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| @gulp-sourcemaps/identity-map → postcss | 8.4.33 | postcss@7.0.39 | YES (lower) | **KEEP** | Upstream resolves to 7.0.39 via gulp-sourcemaps→@gulp-sourcemaps/identity-map. CVE fix still needed. |
| @vscode/test-web → path-to-regexp | 8.4.0 | path-to-regexp@8.4.0 | YES (same) | **REMOVE** | @vscode/test-web→@koa/router→path-to-regexp@8.4.0. Already at pinned version. |
| prebuild-install → tar-fs | 2.1.4 | tar-fs@2.1.4 | YES (same) | **REMOVE** | kerberos→prebuild-install@7.1.2→tar-fs@2.1.4. Already at pinned version. |
| micromatch | 4.0.8 | 4.0.8 + 3.1.10 | YES (mixed) | **KEEP** | Upstream has micromatch@4.0.8 (fast-glob) but also 3.1.10 (gulp/chokidar/liftoff). CVE fix still needed for 3.x instances. |
| braces | 3.0.3 | 3.0.3 + 2.3.2 | YES (mixed) | **KEEP** | Upstream has braces@3.0.3 (micromatch@4.0.8) but also 2.3.2 (gulp/chokidar). CVE fix still needed for 2.x instances. |
| @types/node-fetch → form-data | 3.0.4 | form-data@3.0.4 | YES (same) | **REMOVE** | @types/node-fetch@2.5.12→form-data@3.0.4. Already at pinned version. |
| @azure/core-http → form-data | 4.0.4 | form-data@4.0.5 | YES (higher) | **REMOVE** | gulp-azure-storage→@azure/storage-blob→@azure/core-http→form-data@4.0.5. Upstream higher. |
| lodash | ^4.17.23 | 4.18.1 + 4.17.21 | YES (mixed) | **KEEP** | Most instances are 4.18.1 but @appium/logger has 4.17.21 (<4.17.23). Override still needed. |
| ajv | 6.14.0 | ajv@6.14.0 | YES (same) | **REMOVE** | eslint→ajv@6.14.0 already at pin. No other unscoped ajv instances in tree. |
| ajv-formats → ajv | ^8.18.0 | ajv@8.18.0 | YES (same) | **REMOVE** | @modelcontextprotocol/sdk→ajv-formats→ajv@8.18.0. Already at pinned version. |
| schema-utils@3 → ajv | 6.14.0 | (not in tree) | NO | **REMOVE** | schema-utils@3 no longer in upstream dependency tree. Orphaned override. |
| schema-utils@4 → ajv | ^8.18.0 | (not in tree) | NO | **REMOVE** | schema-utils@4 no longer in upstream dependency tree. Orphaned override. |
| ajv-keywords@3 → ajv | 6.14.0 | (not in tree) | NO | **REMOVE** | ajv-keywords@3 no longer in upstream dependency tree. Orphaned override. |
| tar | ^7.5.11 | (no upstream override) | YES (devDeps: ^7.5.9) | **MOVE TO OVERRIDE** | Upstream has `devDependencies.tar: ^7.5.9`. Our pin is higher (CVE fix). Already handled via `.rebase/override/code/package.json`. Remove from `add`, keep in `override`. |
| undici | ^7.24.0 | ^7.24.0 (deps) | YES (same) | **REMOVE from overrides** | Upstream `dependencies.undici` is already `^7.24.0`. Override in `.rebase/override/` also sets same value — check if both needed. |
| svgo | ^2.8.1 | svgo@2.8.2 | YES (higher) | **REMOVE** | gulp-svgmin→svgo@2.8.2. Upstream resolves to 2.8.2 which satisfies ^2.8.1. |
| @vscode/test-cli → minimatch | ^9.0.9 | minimatch@9.0.9 | YES (same) | **REMOVE** | @vscode/test-cli→minimatch@9.0.9 and →glob→minimatch@9.0.9. Already at pinned version. |
| @ts-morph/common → minimatch | ^7.4.9 | minimatch@9.0.9 | YES (higher) | **REMOVE** | @ts-morph/common@0.26.1→minimatch@9.0.9. Upstream resolves to 9.0.9 which is well above CVE threshold. |
| @vscode/l10n-dev → minimatch | ^5.1.9 | minimatch@9.0.9 | YES (higher) | **REMOVE** | @vscode/l10n-dev@0.0.35→glob@10.5.0→minimatch@9.0.9. Upstream higher. |
| tsec → minimatch | ^3.1.5 | minimatch@3.1.5 | YES (same) | **REMOVE** | tsec@0.2.7→minimatch@3.1.5 and →glob→minimatch@3.1.5. Already at pinned version. |
| @typescript-eslint/typescript-estree → minimatch | ^9.0.9 | minimatch@9.0.9 | YES (same) | **REMOVE** | @typescript-eslint/typescript-estree@8.45.0→minimatch@9.0.9. Already at pinned version. |
| mocha → glob → minimatch | ^5.1.9 | minimatch@5.1.9 | YES (same) | **REMOVE** | mocha@10.8.2→glob@8.1.0→minimatch@5.1.9 and mocha→minimatch@5.1.9. Already at pinned version. |

## .rebase/add/code/test/mcp/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| qs | 6.14.1 | 6.14.2 (via express, per user's `npm ls`) | YES (transitive, higher) | **REMOVE** | Upstream tree resolves to 6.14.2 which is higher |
| ajv | 8.18.0 | 8.18.0 (via @modelcontextprotocol/sdk, per user's `npm ls`) | YES (transitive, same) | **REMOVE** | Upstream tree already has same version |
| path-to-regexp | 8.4.0 | 8.4.0 (via express→router, per user's `npm ls`) | YES (transitive, same) | **REMOVE** | Upstream tree already has same version |

## .rebase/add/code/test/smoke/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| form-data | ^3.0.4 | form-data@3.0.4 | YES (same) | **REMOVE** | @types/node-fetch@2.5.10→form-data@3.0.4. Already at pinned version. |

## .rebase/add/code/build/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| prebuild-install → tar-fs | 2.1.4 | tar-fs@2.1.4 | YES (same) | **REMOVE** | keytar→prebuild-install@7.1.1→tar-fs@2.1.4. Already at pinned version. |
| jsonwebtoken → jws | ^3.2.3 | jws@3.2.3 | YES (same) | **REMOVE** | @azure/msal-node→jsonwebtoken@9.0.0→jws@3.2.3. Already at pinned version. |
| qs | 6.14.1 | qs@6.14.2 | YES (higher) | **REMOVE** | @vscode/vsce→typed-rest-client→qs@6.14.2. Upstream resolves higher. |
| lodash | ^4.17.23 | lodash@4.18.1 | YES (higher) | **REMOVE** | All build/ lodash instances resolve to 4.18.1 (>=4.17.23). |
| fast-xml-parser | ^4.5.4 | fast-xml-parser@5.5.7 | YES (higher) | **REMOVE** | @azure/storage-blob→@azure/core-xml→fast-xml-parser@5.5.7. Upstream resolves to 5.x. |
| ajv | ^8.18.0 | ajv@8.18.0 | YES (same) | **REMOVE** | @secretlint/config-loader→ajv@8.18.0 and table→ajv@8.18.0. Already at pinned version. |
| @vscode/vsce → minimatch | ^3.1.5 | minimatch@3.1.5 | YES (same) | **REMOVE** | @vscode/vsce→minimatch@3.1.5. Already at pinned version. |
| @vscode/vsce → glob → minimatch | ^10.2.4 | minimatch@10.2.4 | YES (same) | **REMOVE** | @vscode/vsce→glob@11.1.0→minimatch@10.2.4. Already at pinned version. |
| vscode-universal-bundler → minimatch | ^9.0.9 | minimatch@9.0.9 | YES (same) | **REMOVE** | vscode-universal-bundler@0.1.3→minimatch@9.0.9. Already at pinned version. |

## .rebase/add/code/test/integration/browser/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^3.1.5 | minimatch@3.1.5 | YES (same) | **REMOVE** | rimraf→glob→minimatch@3.1.5. Already at pinned version. |

## .rebase/add/code/test/automation/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^3.1.5 | minimatch@3.1.5 | YES (same) | **REMOVE** | cpx2→minimatch@3.1.5, cpx2→glob→minimatch@3.1.5, nodemon→minimatch@3.1.5. Already at pinned version. |

## .rebase/add/code/remote/package.json

### dependencies

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| ws | 8.2.3 | ^8.19.0 | YES | **REMOVE** | Upstream has higher version. Same issue as root package.json. |
| js-yaml | ^4.1.0 | (not present) | NO | KEEP | Che-specific |
| @kubernetes/client-node | ^1.4.0 | (not present) | NO | KEEP | Che-specific |

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| prebuild-install → tar-fs | 2.1.4 | tar-fs@2.1.4 | YES (same) | **REMOVE** | kerberos→prebuild-install@7.1.2→tar-fs@2.1.4. Already at pinned version. |
| undici | ^7.24.0 | undici@7.24.4 | YES (higher) | **REMOVE** | @vscode/proxy-agent→undici@7.24.4. Upstream resolves to 7.24.4 which satisfies ^7.24.0. |

## .rebase/add/code/extensions/notebook-renderers/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| form-data | ^4.0.5 | (not in tree) | NO | **REMOVE** | form-data not found in notebook-renderers dependency tree. Orphaned override. |

## .rebase/add/code/extensions/markdown-language-features/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^3.1.5 | minimatch@3.1.5 | YES (same) | **REMOVE** | vscode-languageclient@8.0.2→minimatch@3.1.5. Already at pinned version. |

## .rebase/add/code/extensions/json-language-features/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^10.2.4 | minimatch@10.2.4 | YES (same) | **REMOVE** | vscode-languageclient@10.0.0-next.20→minimatch@10.2.4. Already at pinned version. |

## .rebase/add/code/extensions/html-language-features/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^10.2.4 | minimatch@10.2.4 | YES (same) | **REMOVE** | vscode-languageclient@10.0.0-next.18→minimatch@10.2.4. Already at pinned version. |

## .rebase/add/code/extensions/github-authentication/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| form-data | ^3.0.4 | form-data@3.0.4 | YES (same) | **REMOVE** | @types/node-fetch@2.5.7→form-data@3.0.4. Already at pinned version. |

## .rebase/add/code/extensions/css-language-features/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| minimatch | ^10.2.4 | minimatch@10.2.4 | YES (same) | **REMOVE** | vscode-languageclient@10.0.0-next.20→minimatch@10.2.4. Already at pinned version. |

## .rebase/add/code/build/npm/gyp/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| glob | 10.5.0 | glob@10.5.0 | YES (same) | **REMOVE** | node-gyp→make-fetch-happen→cacache→glob@10.5.0. Already at pinned version. |
| tar | ^7.5.11 | tar@7.5.11 | YES (same) | **REMOVE** | node-gyp→tar@7.5.11. Already at pinned version. |
| minimatch | ^9.0.9 | minimatch@9.0.9 | YES (same) | **REMOVE** | cacache→glob→minimatch@9.0.9. Already at pinned version. |

## .rebase/add/code/test/monaco/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| lodash | ^4.17.23 | lodash@4.18.1 | YES (higher) | **REMOVE** | axe-playwright→junit-report-builder→lodash@4.18.1. Upstream resolves to 4.18.1 (>=4.17.23). |

## .rebase/add/code/extensions/microsoft-authentication/package.json

### overrides

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| jws | ^3.2.3 | jws@3.2.3 | YES (same) | **REMOVE** | @azure/msal-node@3.8.3→jsonwebtoken@9.0.2→jws@3.2.3. Already at pinned version. |

(Note: `workspaces` entry is structural, not a version pin — skipped)

## .rebase/add/code/extensions/package.json

### devDependencies

| Dependency | Che Pin | Upstream 1.116 | In Upstream? | Action | Reason |
|-----------|---------|----------------|--------------|--------|--------|
| crypto | 1.0.1 | (not present) | NO | KEEP | Che-specific |

## .rebase/override/code/package.json

### dependencies

| Dependency | Che Pin | Upstream 1.116 | Action | Reason |
|-----------|---------|----------------|--------|--------|
| undici | ^7.24.0 | ^7.24.0 | **REMOVE** | Same version — redundant override |

### devDependencies

| Dependency | Che Pin | Upstream 1.116 | Action | Reason |
|-----------|---------|----------------|--------|--------|
| @vscode/l10n-dev | 0.0.18 | 0.0.35 | **OUTDATED — REMOVE or UPDATE** | Upstream has higher version (0.0.35). We pin lower (0.0.18). Likely outdated. |
| @vscode/test-cli | ^0.0.12 | ^0.0.6 | KEEP | Our version is higher |
| @vscode/test-web | ^0.0.77 | ^0.0.76 | KEEP | Our version is higher |
| minimatch | ^3.1.5 | ^3.1.5 | **REMOVE** | Same version — redundant override |
| eslint | ^9.39.3 | ^9.36.0 | KEEP | Our version is higher |
| tar | ^7.5.11 | ^7.5.9 | KEEP | CVE fix — our version is higher |

(Note: `name` and `bin` entries are structural — skipped)

## .rebase/override/code/build/package.json

### devDependencies

| Dependency | Che Pin | Upstream 1.116 | Action | Reason |
|-----------|---------|----------------|--------|--------|
| @types/minimatch | ^3.0.5 | ^3.0.3 | KEEP | Our version is higher |

## .rebase/override/code/extensions/npm/package.json

### dependencies

| Dependency | Che Pin | Upstream 1.116 | Action | Reason |
|-----------|---------|----------------|--------|--------|
| minimatch | ^5.1.9 | minimatch@5.1.8 | YES (lower) | **KEEP** | Upstream npm extension resolves minimatch@5.1.8 which is below ^5.1.9 pin. CVE fix still needed. |

## .rebase/override/code/extensions/github-authentication/package.json

(Contains `activationEvents: ["*"]` — structural, not version-related. Skipped.)

## .rebase/override/code/extensions/microsoft-authentication/package.json

### dependencies

| Dependency | Che Pin | Upstream 1.116 | Action | Reason |
|-----------|---------|----------------|--------|--------|
| keytar | workspace:* | file:./packageMocks/keytar | KEEP | Che overrides to workspace protocol |

---

## Summary of All Actions

### REMOVE (upstream has same or higher version — 45 entries):

| # | File | Dependency | Section | Che Pin | Upstream Resolved |
|---|------|-----------|---------|---------|-------------------|
| 1 | .rebase/add/code/package.json | ws | dependencies | 8.2.3 | ^8.19.0 |
| 2 | .rebase/add/code/package.json | @types/ws | devDependencies | 8.2.0 | ^8.18.1 |
| 3 | .rebase/add/code/package.json | @vscode/test-web → path-to-regexp | overrides | 8.4.0 | 8.4.0 |
| 4 | .rebase/add/code/package.json | prebuild-install → tar-fs | overrides | 2.1.4 | 2.1.4 |
| 5 | .rebase/add/code/package.json | @types/node-fetch → form-data | overrides | 3.0.4 | 3.0.4 |
| 6 | .rebase/add/code/package.json | @azure/core-http → form-data | overrides | 4.0.4 | 4.0.5 |
| 7 | .rebase/add/code/package.json | ajv | overrides | 6.14.0 | 6.14.0 |
| 8 | .rebase/add/code/package.json | ajv-formats → ajv | overrides | ^8.18.0 | 8.18.0 |
| 9 | .rebase/add/code/package.json | schema-utils@3 → ajv | overrides | 6.14.0 | (orphaned) |
| 10 | .rebase/add/code/package.json | schema-utils@4 → ajv | overrides | ^8.18.0 | (orphaned) |
| 11 | .rebase/add/code/package.json | ajv-keywords@3 → ajv | overrides | 6.14.0 | (orphaned) |
| 12 | .rebase/add/code/package.json | undici | overrides | ^7.24.0 | 7.24.4 |
| 13 | .rebase/add/code/package.json | svgo | overrides | ^2.8.1 | 2.8.2 |
| 14 | .rebase/add/code/package.json | @vscode/test-cli → minimatch | overrides | ^9.0.9 | 9.0.9 |
| 15 | .rebase/add/code/package.json | @ts-morph/common → minimatch | overrides | ^7.4.9 | 9.0.9 |
| 16 | .rebase/add/code/package.json | @vscode/l10n-dev → minimatch | overrides | ^5.1.9 | 9.0.9 |
| 17 | .rebase/add/code/package.json | tsec → minimatch | overrides | ^3.1.5 | 3.1.5 |
| 18 | .rebase/add/code/package.json | @typescript-eslint/typescript-estree → minimatch | overrides | ^9.0.9 | 9.0.9 |
| 19 | .rebase/add/code/package.json | mocha → glob → minimatch | overrides | ^5.1.9 | 5.1.9 |
| 20 | .rebase/add/code/test/mcp/package.json | qs | overrides | 6.14.1 | 6.14.2 |
| 21 | .rebase/add/code/test/mcp/package.json | ajv | overrides | 8.18.0 | 8.18.0 |
| 22 | .rebase/add/code/test/mcp/package.json | path-to-regexp | overrides | 8.4.0 | 8.4.0 |
| 23 | .rebase/add/code/test/smoke/package.json | form-data | overrides | ^3.0.4 | 3.0.4 |
| 24 | .rebase/add/code/build/package.json | prebuild-install → tar-fs | overrides | 2.1.4 | 2.1.4 |
| 25 | .rebase/add/code/build/package.json | jsonwebtoken → jws | overrides | ^3.2.3 | 3.2.3 |
| 26 | .rebase/add/code/build/package.json | qs | overrides | 6.14.1 | 6.14.2 |
| 27 | .rebase/add/code/build/package.json | lodash | overrides | ^4.17.23 | 4.18.1 |
| 28 | .rebase/add/code/build/package.json | fast-xml-parser | overrides | ^4.5.4 | 5.5.7 |
| 29 | .rebase/add/code/build/package.json | ajv | overrides | ^8.18.0 | 8.18.0 |
| 30 | .rebase/add/code/build/package.json | @vscode/vsce → minimatch | overrides | ^3.1.5 | 3.1.5 |
| 31 | .rebase/add/code/build/package.json | @vscode/vsce → glob → minimatch | overrides | ^10.2.4 | 10.2.4 |
| 32 | .rebase/add/code/build/package.json | vscode-universal-bundler → minimatch | overrides | ^9.0.9 | 9.0.9 |
| 33 | .rebase/add/code/build/npm/gyp/package.json | glob | overrides | 10.5.0 | 10.5.0 |
| 34 | .rebase/add/code/build/npm/gyp/package.json | tar | overrides | ^7.5.11 | 7.5.11 |
| 35 | .rebase/add/code/build/npm/gyp/package.json | minimatch | overrides | ^9.0.9 | 9.0.9 |
| 36 | .rebase/add/code/test/integration/browser/package.json | minimatch | overrides | ^3.1.5 | 3.1.5 |
| 37 | .rebase/add/code/test/automation/package.json | minimatch | overrides | ^3.1.5 | 3.1.5 |
| 38 | .rebase/add/code/test/monaco/package.json | lodash | overrides | ^4.17.23 | 4.18.1 |
| 39 | .rebase/add/code/remote/package.json | ws | dependencies | 8.2.3 | ^8.19.0 |
| 40 | .rebase/add/code/remote/package.json | prebuild-install → tar-fs | overrides | 2.1.4 | 2.1.4 |
| 41 | .rebase/add/code/remote/package.json | undici | overrides | ^7.24.0 | 7.24.4 |
| 42 | .rebase/add/code/extensions/notebook-renderers/package.json | form-data | overrides | ^4.0.5 | (orphaned) |
| 43 | .rebase/add/code/extensions/github-authentication/package.json | form-data | overrides | ^3.0.4 | 3.0.4 |
| 44 | .rebase/add/code/extensions/markdown-language-features/package.json | minimatch | overrides | ^3.1.5 | 3.1.5 |
| 45 | .rebase/add/code/extensions/microsoft-authentication/package.json | jws | overrides | ^3.2.3 | 3.2.3 |

### REMOVE (redundant .rebase/override entries — 2 entries):

| # | File | Dependency | Section | Che Pin | Upstream |
|---|------|-----------|---------|---------|----------|
| 46 | .rebase/override/code/package.json | undici | dependencies | ^7.24.0 | ^7.24.0 |
| 47 | .rebase/override/code/package.json | minimatch | devDependencies | ^3.1.5 | ^3.1.5 |

### REMOVE (extensions with upstream same or higher — 3 entries):

| # | File | Dependency | Section | Che Pin | Upstream Resolved |
|---|------|-----------|---------|---------|-------------------|
| 48 | .rebase/add/code/extensions/json-language-features/package.json | minimatch | overrides | ^10.2.4 | 10.2.4 |
| 49 | .rebase/add/code/extensions/html-language-features/package.json | minimatch | overrides | ^10.2.4 | 10.2.4 |
| 50 | .rebase/add/code/extensions/css-language-features/package.json | minimatch | overrides | ^10.2.4 | 10.2.4 |

### KEEP (pinned exception — never change — 1 entry):

| # | File | Dependency | Section | Che Pin | Upstream | Reason |
|---|------|-----------|---------|---------|----------|--------|
| 51 | .rebase/override/code/package.json | @vscode/l10n-dev | devDependencies | 0.0.18 | 0.0.35 | Che requires this specific version; listed as permanent exception in dependency-rebase-rules skill. |

### MOVE from add to override (Che version > upstream — 1 entry):

| # | File | Dependency | Section | Che Pin | Upstream |
|---|------|-----------|---------|---------|----------|
| 52 | .rebase/add/code/package.json | tar | overrides | ^7.5.11 | (devDeps: ^7.5.9) |

(Note: `tar` override is already in `.rebase/override/code/package.json` as `devDependencies.tar: ^7.5.11`. The `add` overrides entry may also need to stay for the npm `overrides` section. Needs confirmation.)

### KEEP (CVE fix still needed — upstream resolves lower — 5 entries):

| # | File | Dependency | Section | Che Pin | Upstream Resolved | Reason |
|---|------|-----------|---------|---------|-------------------|--------|
| 53 | .rebase/add/code/package.json | @gulp-sourcemaps/identity-map → postcss | overrides | 8.4.33 | 7.0.39 | CVE fix, upstream has vulnerable 7.x |
| 54 | .rebase/add/code/package.json | micromatch | overrides | 4.0.8 | mixed (3.1.10 + 4.0.8) | CVE fix, upstream still has 3.x |
| 55 | .rebase/add/code/package.json | braces | overrides | 3.0.3 | mixed (2.3.2 + 3.0.3) | CVE fix, upstream still has 2.x |
| 56 | .rebase/add/code/package.json | lodash | overrides | ^4.17.23 | mixed (4.17.21 + 4.18.1) | One instance at 4.17.21 < pin |
| 57 | .rebase/override/code/extensions/npm/package.json | minimatch | dependencies | ^5.1.9 | 5.1.8 | Upstream has 5.1.8 < 5.1.9 pin |

### KEEP (Che-specific, not in upstream — 6 entries):

| # | File | Dependency | Section |
|---|------|-----------|---------|
| 58 | .rebase/add/code/package.json | js-yaml | dependencies |
| 59 | .rebase/add/code/package.json | @types/js-yaml | devDependencies |
| 60 | .rebase/add/code/package.json | @types/minimatch | devDependencies |
| 61 | .rebase/add/code/remote/package.json | js-yaml | dependencies |
| 62 | .rebase/add/code/remote/package.json | @kubernetes/client-node | dependencies |
| 63 | .rebase/add/code/extensions/package.json | crypto | devDependencies |

### KEEP (override version higher than upstream — 4 entries):

| # | File | Dependency | Section | Che Pin | Upstream |
|---|------|-----------|---------|---------|----------|
| 64 | .rebase/override/code/package.json | @vscode/test-cli | devDependencies | ^0.0.12 | ^0.0.6 |
| 65 | .rebase/override/code/package.json | @vscode/test-web | devDependencies | ^0.0.77 | ^0.0.76 |
| 66 | .rebase/override/code/package.json | eslint | devDependencies | ^9.39.3 | ^9.36.0 |
| 67 | .rebase/override/code/package.json | tar | devDependencies | ^7.5.11 | ^7.5.9 |

### KEEP (structural / non-version — 3 entries):

| # | File | Dependency | Section |
|---|------|-----------|---------|
| 68 | .rebase/override/code/package.json | name, bin | (structural) |
| 69 | .rebase/override/code/extensions/github-authentication/package.json | activationEvents | (structural) |
| 70 | .rebase/override/code/extensions/microsoft-authentication/package.json | keytar → workspace:* | dependencies |

### KEEP (build tooling override — 1 entry):

| # | File | Dependency | Section | Che Pin | Upstream |
|---|------|-----------|---------|---------|----------|
| 71 | .rebase/override/code/build/package.json | @types/minimatch | devDependencies | ^3.0.5 | ^3.0.3 |
