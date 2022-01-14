# Copyright (c) 2021-2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Grab content from previously build images
FROM linux-libc-amd64 as linux-libc-content
FROM linux-musl-amd64 as linux-musl-content
FROM quay.io/eclipse/che-machine-exec:7.39.1 as machine-exec

FROM registry.access.redhat.com/ubi8/ubi:8.5-200 AS ubi-builder
RUN mkdir -p /mnt/rootfs
RUN yum install --installroot /mnt/rootfs brotli libstdc++ coreutils glibc-minimal-langpack --releasever 8 --setopt install_weak_deps=false --nodocs -y && yum --installroot /mnt/rootfs clean all
RUN rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/dnf* /mnt/rootfs/var/log/yum.*

WORKDIR /mnt/rootfs

COPY --from=linux-musl-content --chown=0:0 /checode-linux-musl /mnt/rootfs/checode-linux-musl
COPY --from=linux-libc-content --chown=0:0 /checode-linux-libc /mnt/rootfs/checode-linux-libc

RUN mkdir -p /mnt/rootfs/projects && mkdir -p /mnt/rootfs/home/che && mkdir -p /mnt/rootfs/bin/
RUN cat /mnt/rootfs/etc/passwd | sed s#root:x.*#root:x:\${USER_ID}:\${GROUP_ID}::\${HOME}:/bin/bash#g > /mnt/rootfs/home/che/.passwd.template \
    && cat /mnt/rootfs/etc/group | sed s#root:x:0:#root:x:0:0,\${USER_ID}:#g > /mnt/rootfs/home/che/.group.template
RUN for f in "/mnt/rootfs/bin/" "/mnt/rootfs/home/che" "/mnt/rootfs/etc/passwd" "/mnt/rootfs/etc/group" "/mnt/rootfs/projects" ; do\
           chgrp -R 0 ${f} && \
           chmod -R g+rwX ${f}; \
       done

COPY --from=machine-exec --chown=0:0 /go/bin/che-machine-exec /mnt/rootfs/bin/machine-exec
COPY --chmod=755 /build/scripts/*.sh /mnt/rootfs/

# Create all-in-one image
FROM scratch
COPY --from=ubi-builder /mnt/rootfs/ /
ENV HOME=/home/che
USER 1001
ENTRYPOINT /entrypoint.sh
