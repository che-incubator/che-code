# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/eclipse/che-machine-exec:7.39.1 as machine-exec

# https://access.redhat.com/containers/?tab=tags#/registry.access.redhat.com/ubi8/nodejs-minimal-14
FROM registry.access.redhat.com/ubi8/nodejs-14-minimal:1-33

USER root
ENV HOME=/home/che
ENV NPM_CONFIG_PREFIX=/home/che/.npm-global

# Install libsecret-devel on s390x and ppc64le for keytar build (binary included in npm package for x86)
RUN microdnf install -y libsecret curl make cmake gcc gcc-c++ python2 git git-core-doc openssh less libX11-devel libxkbcommon bash tar gzip rsync patch pkg-config glib2-devel 
RUN rpm -ivh "https://rpmfind.net/linux/centos/8-stream/BaseOS/x86_64/os/Packages/libsecret-devel-0.18.6-1.el8.x86_64.rpm" \
    && rpm -ivh "https://rpmfind.net/linux/centos/8-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-1.el8.x86_64.rpm" \
    && rpm -ivh "https://rpmfind.net/linux/centos/8-stream/PowerTools/x86_64/os/Packages/libxkbfile-devel-1.1.0-1.el8.x86_64.rpm" \
    && microdnf -y clean all && rm -rf /var/cache/yum \
    # node-gyp will search for python3
    && ln -s /usr/bin/python2 /usr/bin/python3 \
    && npm install -g yarn@1.22.10
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Install procps to manage to kill processes and centos stream repository
RUN [[ $(uname -m) == "x86_64" ]] && \
    ARCH=$(uname -m) && \
    microdnf install --nobest -y procps \
    && rpm -ivh "https://rpmfind.net/linux/epel/8/Everything/${ARCH}/Packages/e/epel-release-8-13.el8.noarch.rpm" \
    && rpm -ivh "http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-gpg-keys-8-3.el8.noarch.rpm" \
    && rpm -ivh "http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-stream-repos-8-3.el8.noarch.rpm"

RUN [[ $(uname -m) == "x86_64" ]] && microdnf install -y chromium

RUN mkdir -p /projects && mkdir -p /home/che
RUN cat /etc/passwd | sed s#root:x.*#root:x:\${USER_ID}:\${GROUP_ID}::\${HOME}:/bin/bash#g > /home/che/.passwd.template \
    && cat /etc/group | sed s#root:x:0:#root:x:0:0,\${USER_ID}:#g > /home/che/.group.template
RUN for f in "/bin/" "/home/che" "/etc/passwd" "/etc/group" "/projects" ; do\
           chgrp -R 0 ${f} && \
           chmod -R g+rwX ${f}; \
       done

COPY --from=machine-exec --chown=0:0 /go/bin/che-machine-exec /bin/machine-exec
COPY --chmod=755 /build/scripts/entrypoint-dev.sh /entrypoint.sh

USER 1001
ENTRYPOINT /entrypoint.sh
WORKDIR /projects
ENV PATH /home/che/.npm-global/bin/:$PATH

# build che-code and keep node-modules folder
RUN git clone --depth 1 https://github.com/che-incubator/che-code /tmp/che-code && \
    cd /tmp/che-code && yarn && cd /tmp/che-code/code && yarn compile && \
    tar zcf ${HOME}/.node_modules.tgz node_modules && rm -rf /tmp/che-code
