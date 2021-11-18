# Make an assembly including both musl and libc variant to be able to run on all linux systems
FROM docker.io/node:14.16.0-alpine3.13 as linux-musl-builder
RUN apk add --update --no-cache \
    # Download some files
    curl \
    # compile some javascript native stuff (node-gyp)
    make gcc g++ python2 \
    # git 
    git \
    # bash shell
    bash \
    # some lib to compile 'native-keymap' npm mpdule
    libx11-dev libxkbfile-dev \
    # requirements for keytar
    libsecret libsecret-dev

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

RUN chmod a+x /checode/out/vs/server/main.js \
    && chgrp -R 0 /checode && chmod -R g+rwX /checode

# Compile test suites
# https://github.com/microsoft/vscode/blob/cdde5bedbf3ed88f93b5090bb3ed9ef2deb7a1b4/test/integration/browser/README.md#compile
RUN [[ $(uname -m) == "x86_64" ]] && yarn --cwd test/smoke compile && yarn --cwd test/integration/browser compile

# install test dependencies
# chromium for tests and procps as tests are using kill commands and it does not work with busybox implementation
RUN [[ $(uname -m) == "x86_64" ]] && apk add --update --no-cache chromium procps
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN [[ $(uname -m) == "x86_64" ]] && yarn playwright-install
RUN [[ $(uname -m) == "x86_64" ]] && rm /root/.cache/ms-playwright/chromium-930007/chrome-linux/chrome && \
    ln -s /usr/bin/chromium-browser /root/.cache/ms-playwright/chromium-930007/chrome-linux/chrome

# Run integration tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && VSCODE_REMOTE_SERVER_PATH="$(pwd)/../vscode-reh-web-linux-alpine" \
    ./resources/server/test/test-web-integration.sh --browser chromium

# Run smoke tests (Browser)
RUN [[ $(uname -m) == "x86_64" ]] && VSCODE_REMOTE_SERVER_PATH="$(pwd)/../vscode-reh-web-linux-alpine" \
    yarn smoketest-no-compile --web --headless --electronArgs="--disable-dev-shm-usage --use-gl=swiftshader"


FROM scratch as linux-musl-content
COPY --from=linux-musl-builder /checode /checode-linux-musl
