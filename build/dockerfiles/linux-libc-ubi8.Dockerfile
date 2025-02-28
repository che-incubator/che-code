# Copyright (c) 2021-2024 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# https://registry.access.redhat.com/ubi8/nodejs-20
FROM registry.access.redhat.com/ubi8/nodejs-20:1-73.1742991506 as linux-libc-ubi8-builder

USER root

# Export GITHUB_TOKEN into environment variable
ARG GITHUB_TOKEN=''
ENV GITHUB_TOKEN=$GITHUB_TOKEN

# Unset GITHUB_TOKEN environment variable if it is empty.
# This is needed for some tools which use this variable and will fail with 401 Unauthorized error if it is invalid.
# For example, vscode ripgrep downloading is an example of such case.
RUN if [ -z $GITHUB_TOKEN ]; then unset GITHUB_TOKEN; fi

# Install libsecret-devel on s390x and ppc64le for keytar build (binary included in npm package for x86)
RUN { if [[ $(uname -m) == "s390x" ]]; then LIBSECRET="\
      https://rpmfind.net/linux/fedora-secondary/releases/34/Everything/s390x/os/Packages/l/libsecret-0.20.4-2.fc34.s390x.rpm \
      https://rpmfind.net/linux/fedora-secondary/releases/34/Everything/s390x/os/Packages/l/libsecret-devel-0.20.4-2.fc34.s390x.rpm"; \
    elif [[ $(uname -m) == "ppc64le" ]]; then LIBSECRET="\
      libsecret \
      https://vault.centos.org/centos/8-stream/BaseOS/ppc64le/os/Packages/libsecret-devel-0.18.6-1.el8.ppc64le.rpm"; \
    elif [[ $(uname -m) == "x86_64" ]]; then LIBSECRET="\
      https://vault.centos.org/centos/8-stream/BaseOS/x86_64/os/Packages/libsecret-devel-0.18.6-1.el8.x86_64.rpm \
      libsecret"; \
    elif [[ $(uname -m) == "aarch64" ]]; then LIBSECRET="\
      https://vault.centos.org/centos/8-stream/BaseOS/aarch64/os/Packages/libsecret-devel-0.18.6-1.el8.aarch64.rpm \
      libsecret"; \
    else \
      LIBSECRET=""; echo "Warning: arch $(uname -m) not supported"; \
    fi; } \
    && { if [[ $(uname -m) == "x86_64" ]]; then LIBKEYBOARD="\
      https://vault.centos.org/centos/8-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-1.el8.x86_64.rpm \
      https://vault.centos.org/centos/8-stream/PowerTools/x86_64/os/Packages/libxkbfile-devel-1.1.0-1.el8.x86_64.rpm"; \
    elif [[ $(uname -m) == "ppc64le" ]]; then LIBKEYBOARD="\
      https://vault.centos.org/8-stream/AppStream/ppc64le/os/Packages/libxkbfile-1.1.0-1.el8.ppc64le.rpm \
      https://vault.centos.org/8-stream/PowerTools/ppc64le/os/Packages/libxkbfile-devel-1.1.0-1.el8.ppc64le.rpm"; \
    elif [[ $(uname -m) == "aarch64" ]]; then LIBKEYBOARD="\
      https://vault.centos.org/centos/8-stream/AppStream/aarch64/os/Packages/libxkbfile-1.1.0-1.el8.aarch64.rpm \
      https://vault.centos.org/centos/8-stream/PowerTools/aarch64/os/Packages/libxkbfile-devel-1.1.0-1.el8.aarch64.rpm"; \
    else \
      LIBKEYBOARD=""; echo "Warning: arch $(uname -m) not supported"; \
    fi; } \
    && yum install -y $LIBSECRET $LIBKEYBOARD curl make cmake gcc gcc-c++ python3.9 git git-core-doc openssh less libX11-devel libxkbcommon bash tar gzip rsync patch \
    && yum -y clean all && rm -rf /var/cache/yum

#########################################################
#
# Copy Che-Code to the container
#
#########################################################
COPY code /checode-compilation
WORKDIR /checode-compilation
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Initialize a git repository for code build tools
RUN git init .

# change network timeout (slow using multi-arch build)
RUN npm config set fetch-retry-mintimeout 100000 && npm config set fetch-retry-maxtimeout 600000

# Grab dependencies (and force to rebuild them)
RUN rm -rf /checode-compilation/node_modules && npm install --force

# Compile
RUN NODE_ARCH=$(echo "console.log(process.arch)" | node) \
    && NODE_VERSION=$(cat /checode-compilation/remote/.npmrc | grep target | cut -d '=' -f 2 | tr -d '"') \
    # cache node from this image to avoid to grab it from within the build
    && mkdir -p /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH} \
    && echo "caching /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH}/node" \
    && cp /usr/bin/node /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH}/node \
    && NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/gulp vscode-reh-web-linux-${NODE_ARCH}-min \
    && cp -r ../vscode-reh-web-linux-${NODE_ARCH} /checode

RUN chmod a+x /checode/out/server-main.js \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

### Beginning of tests
# Do not change line above! It is used to cut this section to skip tests

# Do not change line below! It is used to cut this section to skip tests
### Ending of tests

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

# Store the content of the result
FROM scratch as linux-libc-content
COPY --from=linux-libc-ubi8-builder /checode /checode-linux-libc/ubi8
