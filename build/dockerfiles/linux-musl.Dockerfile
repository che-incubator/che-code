# Copyright (c) 2021-2023 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Make an assembly including both musl and libc variant to be able to run on all linux systems
FROM docker.io/node:20-alpine3.20 as linux-musl-builder

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

# workaround for https://github.com/nodejs/node/issues/52229
ENV CXXFLAGS='-DNODE_API_EXPERIMENTAL_NOGC_ENV_OPT_OUT'

# Initialize a git repository for code build tools
RUN git init .

# change network timeout (slow using multi-arch build)
RUN npm config set fetch-retry-mintimeout 100000 && npm config set fetch-retry-maxtimeout 600000

# Grab dependencies (and force to rebuild them)
RUN rm -rf /checode-compilation/node_modules && npm install --force

# Rebuild platform specific dependencies
RUN npm rebuild

RUN NODE_VERSION=$(cat /checode-compilation/remote/.npmrc | grep target | cut -d '=' -f 2 | tr -d '"') \
    # cache node from this image to avoid to grab it from within the build
    && echo "caching /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine/node" \
    && mkdir -p /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine \
    && cp /usr/local/bin/node /checode-compilation/.build/node/v${NODE_VERSION}/linux-alpine/node \
    # workaround to fix build
    && cp -r /checode-compilation/node_modules/tslib /checode-compilation/remote/node_modules/

RUN NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/gulp vscode-reh-web-linux-alpine-min
RUN cp -r ../vscode-reh-web-linux-alpine /checode

RUN chmod a+x /checode/out/server-main.js \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

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
