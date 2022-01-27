# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/eclipse/che-machine-exec:7.42.0 as machine-exec

FROM registry.access.redhat.com/ubi8/ubi:8.5-214 AS ubi-micro-build
RUN mkdir -p /mnt/rootfs
#echo -e "[nodejs]\nname=nodejs\nstream=$NODEJS_VERSION\nprofiles=\nstate=enabled\n" > /etc/dnf/modules.d/nodejs.module
RUN ARCH=$(uname -m) && yum install --installroot /mnt/rootfs libsecret curl make cmake gcc gcc-c++ python2 git git-core-doc openssh less wget \
                 "https://rpmfind.net/linux/centos/8-stream/BaseOS/x86_64/os/Packages/libsecret-devel-0.18.6-1.el8.x86_64.rpm" \
                 "https://rpmfind.net/linux/centos/8-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-1.el8.x86_64.rpm" \
                 "https://rpmfind.net/linux/centos/8-stream/PowerTools/x86_64/os/Packages/libxkbfile-devel-1.1.0-1.el8.x86_64.rpm" \
                 procps \
                 "https://rpmfind.net/linux/epel/8/Everything/${ARCH}/Packages/e/epel-release-8-13.el8.noarch.rpm" \
                 "http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-gpg-keys-8-3.el8.noarch.rpm" \
                 "http://mirror.centos.org/centos/8-stream/BaseOS/${ARCH}/os/Packages/centos-stream-repos-8-3.el8.noarch.rpm" \
                libX11-devel libxkbcommon bash tar gzip rsync patch pkg-config glib2-devel coreutils-single glibc-minimal-langpack httpd --releasever 8 --nodocs -y && yum --installroot /mnt/rootfs clean all
# node-gyp will search for python
RUN cd /mnt/rootfs && ln -s /usr/bin/python2 ./usr/bin/python
                
RUN rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/dnf* /mnt/rootfs/var/log/yum.*

# Download nodejs required by VS Code
RUN mkdir -p /mnt/rootfs/opt/nodejs && curl -sL https://nodejs.org/download/release/v14.18.3/node-v14.18.3-linux-x64.tar.gz | tar xzf - -C /mnt/rootfs/opt/nodejs --strip-components=1

# setup home folder inside the new fs
ENV HOME=/mnt/rootfs/home/che
ENV NPM_CONFIG_PREFIX=/mnt/rootfs/home/che/.npm-global
ENV PATH /mnt/rootfs/opt/nodejs/bin:/mnt/rootfs/home/che/.npm-global/bin/:$PATH

# install yarn
RUN npm install -g yarn

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
 
RUN cat /mnt/rootfs/etc/passwd | sed s#root:x.*#root:x:\${USER_ID}:\${GROUP_ID}::\${HOME}:/bin/bash#g > /mnt/rootfs/home/che/.passwd.template \
    && cat /mnt/rootfs/etc/group | sed s#root:x:0:#root:x:0:0,\${USER_ID}:#g > /mnt/rootfs/home/che/.group.template


COPY --from=machine-exec --chown=0:0 /go/bin/che-machine-exec /mnt/rootfs/bin/machine-exec
COPY --chmod=755 /build/scripts/entrypoint-dev.sh /mnt/rootfs/entrypoint.sh

RUN mkdir -p /mnt/rootfs/projects

RUN for f in "/mnt/rootfs/home/che" "/mnt/rootfs/etc/passwd" "/mnt/rootfs/etc/group" "/mnt/rootfs/projects" ; do\
           chgrp -R 0 ${f} && \
           chmod -R g+rwX ${f}; \
       done




FROM scratch
COPY --from=ubi-micro-build /mnt/rootfs/ /
ENV HOME=/home/che
ENV NPM_CONFIG_PREFIX=/home/che/.npm-global
ENV PATH /opt/nodejs/bin:/home/che/.npm-global/bin/:$PATH
ENTRYPOINT /entrypoint.sh
WORKDIR /projects
# build che-code and keep node-modules folder
RUN git clone --depth 1 https://github.com/che-incubator/che-code /tmp/che-code && \
    cd /tmp/che-code && yarn && cd /tmp/che-code/code && yarn compile && \
    tar zcf /home/che/.node_modules.tgz node_modules && rm -rf /tmp/che-code && \
    chgrp -R 0 /home/che && chmod -R g+rwX /home/che
USER 1001
