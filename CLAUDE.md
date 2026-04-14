# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**che-code** is Eclipse Che's fork of Microsoft's VS Code (Code-OSS) that runs in a browser, connecting to a remote HTTP(s) server on Kubernetes instead of desktop mode. The terminal is container-aware: it can open shells in any container of the running pod.

Upstream VS Code is stored as a Git subtree in the `code/` directory. The repository is self-contained (no submodule setup needed).

## Build & Development Commands

### Development Mode
```bash
npm install                # Install deps + download built-in extensions (runs in code/)
npm run watch              # Compile and watch for changes
npm run server             # Run VS Code server at localhost:8000 (dev mode)
```

### Production Build
```bash
npm run build              # Build vscode-reh-web-linux-x64 (unminified)
npm run build:min          # Build vscode-reh-web-linux-x64 (minified)
npm run rebuild-native-modules  # Rebuild native Node modules
```

### Container Image Build (in order)
```bash
podman build -f build/dockerfiles/linux-musl.Dockerfile -t linux-musl .
podman build -f build/dockerfiles/linux-libc-ubi8.Dockerfile -t linux-libc-ubi8 .
podman build -f build/dockerfiles/linux-libc-ubi9.Dockerfile -t linux-libc-ubi9 .
podman build -f build/dockerfiles/assembly.Dockerfile -t che-code .
```

### Running the Container Locally
```bash
podman run --rm -it -p 3100:3100 -e CODE_HOST=0.0.0.0 quay.io/che-incubator/che-code:next
```

### Tests (inside `code/`)
```bash
cd code
npm run test-node          # Mocha unit tests (Node.js)
npm run test-browser       # Browser unit tests (Playwright)
npm run test-extension     # Extension tests (vscode-test)
npm run smoketest          # Full smoke test suite
```

### Linting (inside `code/`)
```bash
cd code
node build/eslint          # ESLint
node build/stylelint       # Stylelint
npm run hygiene            # Full hygiene check (formatting, imports, layers)
npm run valid-layers-check # Architecture layer validation
```

### Launcher (`launcher/`)
```bash
cd launcher
npm run compile            # TypeScript compile
npm run lint               # ESLint
npm run format             # Prettier check
npm run format:fix         # Prettier auto-fix
npm run build              # Full build (format + compile + lint + test)
```
Launcher uses Jest for testing, TypeScript 5.6+, and ES2022 modules.

### Che Extension License Check
```bash
npm --prefix code/extensions/che-api run license:generate
```
Replace `che-api` with any Che extension name. Generates dependency reports in `.deps/`.

## Architecture

### Directory Structure

- **`code/`** — VS Code upstream (git subtree) with Che modifications. This is where the bulk of the editor source lives (`code/src/vs/`, `code/extensions/`).
- **`launcher/`** — Standalone TypeScript project that configures and launches VS Code in Kubernetes. Handles workspace config, product.json generation, Open VSX registry integration, SSL certificates, and Kubernetes API interaction.
- **`build/dockerfiles/`** — Multi-stage Dockerfiles for three platform targets (musl/Alpine, libc-ubi8, libc-ubi9) plus an assembly Dockerfile that combines them.
- **`build/scripts/`** — Container entrypoint scripts (`entrypoint.sh`, `entrypoint-volume.sh`, `entrypoint-init-container.sh`).
- **`build/artifacts/`** — `artifacts.lock.yaml` locks built-in extension versions with SHA256 checksums. Regenerate with `./build/artifacts/generate.sh`.
- **`branding/`** — UI branding customization (icons, product.json overrides, CSS). Applied via `branding/branding.sh`.
- **`.rebase/`** — Patch management for upstream rebasing:
  - `add/` — Files to add to upstream
  - `override/` — JSON files to merge over upstream (via jq)
  - `replace/` — Per-file JSON replacement rules keyed by file path (not full file swaps). Each entry is a JSON object with `from` and `by` strings applied to the specified file path.

### Che-Specific Extensions (in `code/extensions/`)

Nine extensions provide Kubernetes/Che integration:
- `che-api` — API for Che platform integration
- `che-activity-tracker` — User activity tracking
- `che-commands` — Custom command support
- `che-github-authentication` — GitHub OAuth flow
- `che-port` — Port exposure management for pods
- `che-remote` — Remote workspace status indicator
- `che-resource-monitor` — Resource usage monitoring
- `che-terminal` — Container-aware terminal (open shells in any pod container)
- `che-telemetry` — Telemetry collection

### Key Entry Points

- `code/src/server-main.ts` — VS Code remote server entry point
- `code/src/vs/` — Core VS Code modules (layered architecture enforced by `valid-layers-check`)
- `launcher/src/entrypoint.ts` — Launcher entry point for Kubernetes environments
- `launcher/src/vscode-launcher.ts` — VS Code process management

### Upstream Rebase Workflow

To rebase on upstream VS Code:
1. `git remote add upstream-code https://github.com/microsoft/vscode` (if not already added)
2. `git fetch upstream-code release/<version>` — fetch the release branch that `rebase.sh` targets (check `UPSTREAM_VERSION` in `rebase.sh` for the current ref, e.g. `upstream-code/release/1.104`)
3. `./rebase.sh` — Pulls subtree, applies `.rebase/` patches, updates JSON overrides
4. Fix any conflicts
5. `./build/artifacts/generate.sh` to update `artifacts.lock.yaml`

### Build System

The `code/` directory uses Gulp as its build system. Key gulp tasks:
- `vscode-reh-web-linux-x64` / `vscode-reh-web-linux-x64-min` — Build the remote web host
- `watch-client` / `watch-extensions` — Watch mode (both run in parallel via `npm run watch`)
- `compile-build-with-mangling` — Production compilation with name mangling

Node.js version must match what upstream VS Code requires (check `code/remote/.npmrc` for the `target` property).

### Multi-Platform Container Strategy

The final image is assembled from three platform-specific builds:
- **linux-musl** — Alpine Linux (musl libc)
- **linux-libc-ubi8** — Red Hat UBI 8
- **linux-libc-ubi9** — Red Hat UBI 9

The `assembly.Dockerfile` combines all three into a single image that selects the right binary at runtime.