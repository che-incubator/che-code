# Copyright (c) 2021-2026 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Use Debian-based Node.js image for all architectures (amd64, arm64, ppc64le)
FROM docker.io/node:24-bookworm as linux-musl-builder

# Set architecture variable for later use
ARG TARGETARCH
ENV BUILD_ARCH=${TARGETARCH}

# Install dependencies using apt-get (Debian package manager)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Download some files
    curl \
    patch \
    # compile some javascript native stuff (node-gyp)
    make gcc g++ python3 python3-pip \
    # git
    git \
    # bash shell
    bash \
    # some lib to compile 'native-keymap' npm module
    libx11-dev libxkbfile-dev \
    # requirements for keytar
    libsecret-1-dev \
    # kerberos authentication
    libkrb5-dev \
    ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*

#########################################################
#
# Copy Che-Code to the container
#
#########################################################
COPY code /checode-compilation
WORKDIR /checode-compilation

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV VSCODE_SKIP_HEADER_INSTALL=1

# workaround for https://github.com/nodejs/node/issues/52229
# GCC 15 in Alpine 3.24 requires nullptr_t to be explicitly declared;
# Node.js v24's V8 headers use bare nullptr_t without std:: qualification.
# A macro-based fix (-Dnullptr_t=...) breaks std::nullptr_t via recursive substitution,
# so we create a header that uses a proper using-declaration instead.
RUN printf '#include <cstddef>\nusing nullptr_t = std::nullptr_t;\n' > /usr/local/include/fix_nullptr.h
ENV CXXFLAGS='-DNODE_API_EXPERIMENTAL_NOGC_ENV_OPT_OUT -include /usr/local/include/fix_nullptr.h'

# Initialize a git repository for code build tools
RUN git init .

# change network timeout (slow using multi-arch build)
RUN npm config set fetch-retry-mintimeout 100000 && npm config set fetch-retry-maxtimeout 600000

# prepareBuiltInCopilotRipgrepShim has no unsupported-arch guard unlike other
# copilot functions. Patch it to skip gracefully on ppc64le/s390x.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      sed -i 's/export function prepareBuiltInCopilotRipgrepShim(platform: string, arch: string, builtInCopilotExtensionDir: string, appNodeModulesDir: string): void {/export function prepareBuiltInCopilotRipgrepShim(platform: string, arch: string, builtInCopilotExtensionDir: string, appNodeModulesDir: string): void {\n\tif (!copilotPlatforms.includes(toCopilotPackagePlatformArch(platform, arch))) { return; }/' \
        build/lib/copilot.ts; \
    fi

# The root .npmrc sets runtime=electron and disturl=electronjs.org for desktop builds.
# On ppc64le/s390x we build the web server only — write global npmrc overrides so
# node-gyp uses plain Node headers. Project .npmrc is left intact for build tools.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      printf 'runtime=node\ndisturl=https://nodejs.org/dist\nbuild_from_source=false\n' \
        >> /root/.npmrc; \
    fi

# @vscode/vsce-sign and @github/copilot have no binary for ppc64le/s390x.
# Disable their postinstall scripts before npm install.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      sed -i '/@vscode\/vsce-sign/,/\}/s/"hasInstallScript": true/"hasInstallScript": false/' \
        build/package-lock.json \
        extensions/copilot/package-lock.json; \
      sed -i 's/"postinstall": "tsx \.\/script\/postinstall\.ts"/"postinstall": "echo skipped"/' \
        extensions/copilot/package.json; \
    fi

# On ppc64le/s390x, build_from_source in remote/.npmrc causes node-gyp to
# download headers from nodejs.org which times out. Disable it and also
# disable @parcel/watcher install script since no prebuilt exists for ppc64le.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      sed -i '/^build_from_source/d' remote/.npmrc; \
      sed -i '0,/"hasInstallScript": true/s/"hasInstallScript": true/"hasInstallScript": false/' \
        remote/package-lock.json; \
    fi

# Grab dependencies (and force to rebuild them)
RUN rm -rf /checode-compilation/node_modules && npm install --force

# Disable @vscode/vsce-sign postinstall in installed node_modules for unsupported architectures.
# npm install unpacks the package fresh, so the patch must be applied after install and before rebuild.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      find . -path "*/node_modules/@vscode/vsce-sign/package.json" -exec \
        sed -i 's/"postinstall": "node \.\/src\/postinstall\.js"/"postinstall": "echo skipped"/' {} +; \
    fi

# Rebuild platform specific dependencies
RUN npm rebuild

# tsgo has no native binary for ppc64le/s390x - replace it with a no-op so
# type-check steps (noEmit only) are skipped gracefully during the build.
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" != "amd64" ] && [ "${TARGETARCH}" != "arm64" ]; then \
      find . -path "*/node_modules/.bin/tsgo" | while read f; do \
        echo '#!/bin/sh' > "$f"; \
        echo 'exit 0' >> "$f"; \
        chmod +x "$f"; \
      done; \
    fi

# Cache node binary with architecture-specific path
RUN NODE_VERSION=$(cat /checode-compilation/remote/.npmrc | grep target | cut -d '=' -f 2 | tr -d '"') \
    && if [ "${TARGETARCH}" = "ppc64le" ]; then \
         PLATFORM_DIR="linux-ppc64"; \
       elif [ "${TARGETARCH}" = "arm64" ]; then \
         PLATFORM_DIR="linux-arm64"; \
       else \
         PLATFORM_DIR="linux-x64"; \
       fi \
    && echo "caching /checode-compilation/.build/node/v${NODE_VERSION}/${PLATFORM_DIR}/node" \
    && mkdir -p /checode-compilation/.build/node/v${NODE_VERSION}/${PLATFORM_DIR} \
    && cp /usr/local/bin/node /checode-compilation/.build/node/v${NODE_VERSION}/${PLATFORM_DIR}/node \
    && cp -r /checode-compilation/node_modules/tslib /checode-compilation/remote/node_modules/

# Compile non-arch-specific assets (main's new pipeline steps)
RUN NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/gulp copy-codicons compile-non-native-extensions-build compile-extension-media-build

# Compile copilot extension only on supported architectures
# hadolint ignore=SC3014
RUN if [ "${TARGETARCH}" = "amd64" ] || [ "${TARGETARCH}" = "arm64" ]; then \
      NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/gulp compile-copilot-extension-build; \
    fi

RUN npx tsgo --project src/tsconfig.json --noEmit --skipLibCheck

RUN NODE_OPTIONS="--max-old-space-size=8192" node build/next/index.ts bundle --minify --nls --mangle-privates --target server-web --out out-vscode-reh-web-min

# Build and copy with architecture-specific gulp target
RUN if [ "${TARGETARCH}" = "ppc64le" ]; then \
      NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/gulp vscode-reh-web-linux-ppc64-min-ci; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
      NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/gulp vscode-reh-web-linux-arm64-min-ci; \
    else \
      NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/gulp vscode-reh-web-linux-alpine-min-ci; \
    fi

RUN if [ "${TARGETARCH}" = "ppc64le" ]; then \
      cp -r ../vscode-reh-web-linux-ppc64 /checode; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
      cp -r ../vscode-reh-web-linux-arm64 /checode; \
    else \
      cp -r ../vscode-reh-web-linux-alpine /checode; \
    fi

# Pre-compress static assets for faster HTTP delivery (served by che/webClientServer.ts)
# Exclude files patched by the launcher at runtime — they are compressed post-patch by the launcher itself
RUN find /checode/out -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.json" \) -size +1k \
    -not -path "*/vs/code/browser/workbench/workbench.js" \
    -not -path "*/vs/workbench/workbench.web.main.internal.js" \
    -not -path "*/vs/workbench/api/node/extensionHostProcess.js" \
    -exec gzip -9 -k {} \;

RUN chmod a+x /checode/out/server-main.js \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

# Compile tests
RUN ./node_modules/.bin/gulp compile-extension:vscode-api-tests \
    compile-extension:markdown-language-features \
    compile-extension:typescript-language-features \
    compile-extension:emmet \
    compile-extension:git \
    compile-extension:ipynb \
    compile-extension-media \
    compile-extension:configuration-editing

# Compile test suites
# https://github.com/microsoft/vscode/blob/cdde5bedbf3ed88f93b5090bb3ed9ef2deb7a1b4/test/integration/browser/README.md#compile
RUN if [ "$(uname -m)" = "x86_64" ]; then \
      npm --prefix test/smoke run compile && npm --prefix test/integration/browser run compile; \
    fi

# use of retry and timeout
COPY /build/scripts/helper/retry.sh /usr/bin/retry
RUN chmod u+x /usr/bin/retry

# install test dependencies
# chromium for tests and procps as tests are using kill commands and it does not work with busybox implementation
RUN if [ "$(uname -m)" = "x86_64" ]; then \
      apt-get update && apt-get install -y --no-install-recommends chromium \
      && rm -rf /var/lib/apt/lists/*; \
    fi

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

RUN if [ "$(uname -m)" = "x86_64" ]; then \
      npm run playwright-install; \
    fi

RUN if [ "$(uname -m)" = "x86_64" ]; then \
      PLAYWRIGHT_CHROMIUM_PATH=$(echo /root/.cache/ms-playwright/chromium-*/chrome-linux64) && \
      PLAYWRIGHT_HEADLESS_PATH=$(echo /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64) && \
      echo "Found chromium path: $PLAYWRIGHT_CHROMIUM_PATH" && \
      echo "Found headless_shell path: $PLAYWRIGHT_HEADLESS_PATH" && \
      rm -f "$PLAYWRIGHT_HEADLESS_PATH/headless_shell" && \
      if command -v chromium-browser > /dev/null; then \
        ln -sf /usr/bin/chromium-browser "$PLAYWRIGHT_HEADLESS_PATH/headless_shell" && \
        ln -sf /usr/bin/chromium-browser "$PLAYWRIGHT_HEADLESS_PATH/chrome"; \
      elif command -v chromium > /dev/null; then \
        ln -sf /usr/bin/chromium "$PLAYWRIGHT_HEADLESS_PATH/headless_shell" && \
        ln -sf /usr/bin/chromium "$PLAYWRIGHT_HEADLESS_PATH/chrome"; \
      fi && \
      ls -la "$PLAYWRIGHT_HEADLESS_PATH"; \
    fi

# Run integration tests (Browser) with architecture-specific path
RUN if [ "$(uname -m)" = "x86_64" ]; then \
      if [ "${TARGETARCH}" = "ppc64le" ]; then \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-ppc64" \
        retry -v -t 3 -s 2 -- timeout 5m ./scripts/test-web-integration.sh --browser chromium; \
      elif [ "${TARGETARCH}" = "arm64" ]; then \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-arm64" \
        MACHINE_EXEC_MAX_RETRIES=1 \
        retry -v -t 3 -s 2 -- timeout 5m ./scripts/test-web-integration.sh --browser chromium; \
      else \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-alpine" \
        MACHINE_EXEC_MAX_RETRIES=1 \
        retry -v -t 3 -s 2 -- timeout 5m ./scripts/test-web-integration.sh --browser chromium; \
      fi \
    fi

# Run smoke tests (Browser) with architecture-specific path
RUN if [ "$(uname -m)" = "x86_64" ]; then \
      if [ "${TARGETARCH}" = "ppc64le" ]; then \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-ppc64" \
        retry -v -t 3 -s 2 -- timeout 5m npm run smoketest-no-compile -- --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"; \
      elif [ "${TARGETARCH}" = "arm64" ]; then \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-arm64" \
        retry -v -t 3 -s 2 -- timeout 5m npm run smoketest-no-compile -- --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"; \
      else \
        VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-alpine" \
        retry -v -t 3 -s 2 -- timeout 5m npm run smoketest-no-compile -- --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"; \
      fi \
    fi

#########################################################
#
# Copy VS Code launcher to the container
#
#########################################################
COPY launcher /checode-launcher
WORKDIR /checode-launcher

RUN npm install \
    && mkdir /checode/launcher \
    && cp -r out/src/*.js /checode/launcher \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

FROM scratch as linux-musl-content
COPY --from=linux-musl-builder /checode /checode-linux-musl

