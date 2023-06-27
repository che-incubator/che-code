# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/devfile/universal-developer-image:latest

USER 0

RUN dnf -y install libsecret libX11-devel libxkbcommon \
    "https://rpmfind.net/linux/centos/8-stream/BaseOS/x86_64/os/Packages/libsecret-devel-0.18.6-1.el8.x86_64.rpm" \
    "https://rpmfind.net/linux/centos/8-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-1.el8.x86_64.rpm" \
    "https://rpmfind.net/linux/centos/8-stream/PowerTools/x86_64/os/Packages/libxkbfile-devel-1.1.0-1.el8.x86_64.rpm"

# cleanup dnf cache
RUN dnf -y clean all --enablerepo='*'

# Create `/etc/containers/containers.conf` configuration file
# to increase amount of opened files
#
# [containers]
# default_ulimits = [
#  "nofile=65535:65535",
# ]

RUN (echo '[containers]'; echo 'default_ulimits = ['; echo ' "nofile=65535:65535",'; echo ']') >> /etc/containers/containers.conf

USER 10001

ENV NODEJS_VERSION=16.17.1

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

RUN source $NVM_DIR/nvm.sh && \
    nvm install v$NODEJS_VERSION && \
    nvm alias default v$NODEJS_VERSION && \
    nvm use v$NODEJS_VERSION && \
    npm install --global npm@9.7.2 && \
    npm install --global yarn@v1.22.19

ENV PATH=$NVM_DIR/versions/node/v$NODEJS_VERSION/bin:$PATH
ENV NODEJS_HOME_16=$NVM_DIR/versions/node/v$NODEJS_VERSION

USER 0

# Set permissions on /home/user/.cache to allow the user to write
RUN yarn global add node-gyp
RUN chgrp -R 0 /home/user/.cache && chmod -R g=u /home/user/.cache

USER 10001
