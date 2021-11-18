# https://access.redhat.com/containers/?tab=tags#/registry.access.redhat.com/ubi8/nodejs-14
FROM registry.access.redhat.com/ubi8/nodejs-14:1-50 as linux-libc-builder

USER root
# Install libsecret-devel on s390x and ppc64le for keytar build (binary included in npm package for x86)
RUN { if [[ $(uname -m) == "s390x" ]]; then LIBSECRET="\
      https://rpmfind.net/linux/fedora-secondary/releases/34/Everything/s390x/os/Packages/l/libsecret-0.20.4-2.fc34.s390x.rpm \
      https://rpmfind.net/linux/fedora-secondary/releases/34/Everything/s390x/os/Packages/l/libsecret-devel-0.20.4-2.fc34.s390x.rpm"; \
    elif [[ $(uname -m) == "ppc64le" ]]; then LIBSECRET="\
      libsecret \
      https://rpmfind.net/linux/centos/8-stream/BaseOS/ppc64le/os/Packages/libsecret-devel-0.18.6-1.el8.ppc64le.rpm"; \
    elif [[ $(uname -m) == "x86_64" ]]; then LIBSECRET="\
      https://rpmfind.net/linux/centos/8-stream/BaseOS/x86_64/os/Packages/libsecret-devel-0.18.6-1.el8.x86_64.rpm \
      libsecret"; \
    elif [[ $(uname -m) == "aarch64" ]]; then LIBSECRET="\
      https://rpmfind.net/linux/centos/8-stream/BaseOS/aarch64/os/Packages/libsecret-devel-0.18.6-1.el8.aarch64.rpm \
      libsecret"; \
    else \
      LIBSECRET=""; echo "Warning: arch $(uname -m) not supported"; \
    fi; } \
    && { if [[ $(uname -m) == "x86_64" ]]; then LIBKEYBOARD="\
      https://rpmfind.net/linux/centos/8-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-1.el8.x86_64.rpm \
      https://rpmfind.net/linux/centos/8-stream/PowerTools/x86_64/os/Packages/libxkbfile-devel-1.1.0-1.el8.x86_64.rpm"; \
    elif [[ $(uname -m) == "aarch64" ]]; then LIBKEYBOARD="\
      https://rpmfind.net/linux/centos/8-stream/AppStream/aarch64/os/Packages/libxkbfile-1.1.0-1.el8.aarch64.rpm \
      https://rpmfind.net/linux/centos/8-stream/PowerTools/aarch64/os/Packages/libxkbfile-devel-1.1.0-1.el8.aarch64.rpm"; \
    else \
      LIBKEYBOARD=""; echo "Warning: arch $(uname -m) not supported"; \
    fi; } \
    && yum install -y $LIBSECRET $LIBKEYBOARD curl make cmake gcc gcc-c++ python2 git git-core-doc openssh less libX11-devel libxkbcommon bash tar gzip rsync patch \
    && yum -y clean all && rm -rf /var/cache/yum \
    && npm install -g yarn@1.22.10
COPY code /checode-compilation
WORKDIR /checode-compilation
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Initialize a git repository for code build tools
RUN git init .

# change network timeout (slow using multi-arch build)
RUN yarn config set network-timeout 600000 -g

# Grab dependencies (and force to rebuild them)
RUN yarn install --force

# Compile
RUN NODE_ARCH=$(echo "console.log(process.arch)" | node) \
    && NODE_VERSION=$(cat /checode-compilation/remote/.yarnrc | grep target | cut -d ' ' -f 2 | tr -d '"') \
    # cache node from this image to avoid to grab it from within the build
    && mkdir -p /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH} \
    && echo "caching /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH}/node" \
    && cp /usr/bin/node /checode-compilation/.build/node/v${NODE_VERSION}/linux-${NODE_ARCH}/node \
    && NODE_OPTIONS="--max_old_space_size=8500" ./node_modules/.bin/gulp vscode-reh-web-linux-${NODE_ARCH}-min \
    && cp -r ../vscode-reh-web-linux-${NODE_ARCH} /checode

RUN chmod a+x /checode/out/vs/server/main.js \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

### Testing

# Compile test suites
# https://github.com/microsoft/vscode/blob/cdde5bedbf3ed88f93b5090bb3ed9ef2deb7a1b4/test/integration/browser/README.md#compile
RUN [[ $(uname -m) == "x86_64" ]] && yarn --cwd test/smoke compile && yarn --cwd test/integration/browser compile

# install test dependencies
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN [[ $(uname -m) == "x86_64" ]] &&  yarn playwright-install 
# Install procps to manage to kill processes and centos stream repository
RUN [[ $(uname -m) == "x86_64" ]] && \
    ARCH=$(uname -m) && \
    yum install --nobest -y procps \
        https://rpmfind.net/linux/epel/8/Everything/${ARCH}/Packages/e/epel-release-8-13.el8.noarch.rpm \
        http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-gpg-keys-8-3.el8.noarch.rpm \
        http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-stream-repos-8-3.el8.noarch.rpm

RUN [[ $(uname -m) == "x86_64" ]] && yum install -y chromium && \
    PLAYWRIGHT_CHROMIUM_PATH=$(echo /opt/app-root/src/.cache/ms-playwright/chromium-*/) && \
    rm "${PLAYWRIGHT_CHROMIUM_PATH}/chrome-linux/chrome" && \
    ln -s /usr/bin/chromium-browser "${PLAYWRIGHT_CHROMIUM_PATH}/chrome-linux/chrome"

# Run integration tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && NODE_ARCH=$(echo "console.log(process.arch)" | node) \
    VSCODE_REMOTE_SERVER_PATH="$(pwd)/../vscode-reh-web-linux-${NODE_ARCH}" \
    ./resources/server/test/test-web-integration.sh --browser chromium

# Run smoke tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && NODE_ARCH=$(echo "console.log(process.arch)" | node) \
    VSCODE_REMOTE_SERVER_PATH="$(pwd)/../vscode-reh-web-linux-${NODE_ARCH}" \
    yarn smoketest-no-compile --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"

# Store the content of the result
FROM scratch as linux-libc-content
COPY --from=linux-libc-builder /checode /checode-linux-libc
