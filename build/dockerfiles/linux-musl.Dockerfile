# Copyright (c) 2021-2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Make an assembly including both musl and libc variant to be able to run on all linux systems
FROM docker.io/node:18.16.1-alpine3.18 as linux-musl-builder

RUN apk add --update --no-cache \
    # Download some files
    curl \
    # compile some javascript native stuff (node-gyp)
    make gcc g++ python3 py3-pip \
    # git 
    git \
    # bash shell
    bash \
    # some lib to compile 'native-keymap' npm mpdule
    libx11-dev libxkbfile-dev \
    # requirements for keytar
    libsecret libsecret-dev \
    # kerberos authentication
    krb5-dev

#########################################################
#
# Copy Che-Code to the container
#
#########################################################
COPY code /checode-compilation
WORKDIR /checode-compilation
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Initialize a git repository for code build tools
RUN git init .

# change network timeout (slow using multi-arch build)
RUN yarn config set network-timeout 600000 -g

# Grab dependencies
RUN yarn

# Rebuild platform specific dependencies
RUN npm rebuild

RUN NODE_VERSION=$(cat /checode-compilation/remote/.yarnrc | grep target | cut -d ' ' -f 2 | tr -d '"') \
    # cache node from this image to avoid to grab it from within the build
    && echo "caching /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine/node" \
    && mkdir -p /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine \
    && cp /usr/local/bin/node /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine/node

RUN NODE_OPTIONS="--max_old_space_size=6500" ./node_modules/.bin/gulp vscode-reh-web-linux-alpine-min
RUN cp -r ../vscode-reh-web-linux-alpine /checode

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
RUN [[ $(uname -m) == "x86_64" ]] && yarn --cwd test/smoke compile && yarn --cwd test/integration/browser compile

# use of retry and timeout
COPY /build/scripts/helper/retry.sh /usr/bin/retry
RUN chmod u+x /usr/bin/retry

# install test dependencies
# chromium for tests and procps as tests are using kill commands and it does not work with busybox implementation
RUN [[ $(uname -m) == "x86_64" ]] && apk add --update --no-cache chromium procps
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN [[ $(uname -m) == "x86_64" ]] && yarn playwright-install
RUN [[ $(uname -m) == "x86_64" ]] && \
     PLAYWRIGHT_CHROMIUM_PATH=$(echo /root/.cache/ms-playwright/chromium-*/) && \
    rm "${PLAYWRIGHT_CHROMIUM_PATH}/chrome-linux/chrome" && \
    ln -s /usr/bin/chromium-browser "${PLAYWRIGHT_CHROMIUM_PATH}/chrome-linux/chrome" && \
    ls -la /checode-compilation/extensions/vscode-api-tests/ && \
    ls -la /checode-compilation/extensions/vscode-api-tests/out/

# Run integration tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-alpine" \
    retry -v -t 3 -s 2 -- timeout 5m ./scripts/test-web-integration.sh --browser chromium

# Run smoke tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && VSCODE_REMOTE_SERVER_PATH="/vscode-reh-web-linux-alpine" \
    retry -v -t 3 -s 2 -- timeout 5m yarn smoketest-no-compile --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"

#########################################################
#
# Copy VS Code launcher to the container
#
#########################################################
COPY launcher /checode-launcher
WORKDIR /checode-launcher
RUN yarn \
    && mkdir /checode/launcher \
    && cp -r out/src/*.js /checode/launcher \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

FROM scratch as linux-musl-content
COPY --from=linux-musl-builder /checode /checode-linux-musl
