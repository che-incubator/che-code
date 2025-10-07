# Copyright (c) 2021-2024 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Grab content from previously build images
FROM linux-libc-ubi8 as linux-libc-ubi8-content
FROM linux-libc-ubi9 as linux-libc-ubi9-content
FROM linux-musl as linux-musl-content

# https://quay.io/eclipse/che-machine-exec#^7\.
FROM quay.io/vrubezhny/che-machine-exec:cli-watcher-10 as machine-exec

# https://registry.access.redhat.com/ubi8/ubi
FROM registry.access.redhat.com/ubi8/ubi:8.10 AS ubi-builder
RUN mkdir -p /mnt/rootfs
RUN yum install --installroot /mnt/rootfs brotli libstdc++ coreutils glibc-minimal-langpack --releasever 8 --setopt install_weak_deps=false --nodocs -y && yum --installroot /mnt/rootfs clean all
RUN rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/dnf* /mnt/rootfs/var/log/yum.*

WORKDIR /mnt/rootfs

COPY --from=linux-musl-content --chown=0:0 /checode-linux-musl /mnt/rootfs/checode-linux-musl
COPY --from=linux-libc-ubi8-content --chown=0:0 /checode-linux-libc/ubi8 /mnt/rootfs/checode-linux-libc/ubi8
COPY --from=linux-libc-ubi9-content --chown=0:0 /checode-linux-libc/ubi9 /mnt/rootfs/checode-linux-libc/ubi9

RUN mkdir -p /mnt/rootfs/projects && mkdir -p /mnt/rootfs/home/che && mkdir -p /mnt/rootfs/bin/
RUN cat /mnt/rootfs/etc/passwd | sed s#root:x.*#root:x:\${USER_ID}:\${GROUP_ID}::\${HOME}:/bin/bash#g > /mnt/rootfs/home/che/.passwd.template \
    && cat /mnt/rootfs/etc/group | sed s#root:x:0:#root:x:0:0,\${USER_ID}:#g > /mnt/rootfs/home/che/.group.template
RUN for f in "/mnt/rootfs/bin/" "/mnt/rootfs/home/che" "/mnt/rootfs/etc/passwd" "/mnt/rootfs/etc/group" "/mnt/rootfs/projects" ; do\
           chgrp -R 0 ${f} && \
           chmod -R g+rwX ${f}; \
       done

COPY --from=machine-exec --chown=0:0 /go/bin/che-machine-exec /mnt/rootfs/bin/machine-exec
COPY --chmod=755 /build/scripts/*.sh /mnt/rootfs/
COPY --chmod=755 /build/remote-config /mnt/rootfs/remote/data/Machine/

# Create all-in-one image
FROM scratch
COPY --from=ubi-builder /mnt/rootfs/ /
ENV HOME=/home/che
USER 1001
ENTRYPOINT /entrypoint.sh
