# Copyright (c) 2021-2026 Red Hat, Inc.
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
FROM quay.io/eclipse/che-machine-exec:next as machine-exec

# https://registry.access.redhat.com/ubi8/ubi
FROM registry.access.redhat.com/ubi8/ubi:8.10 AS ubi-builder
RUN mkdir -p /mnt/rootfs
RUN yum install --installroot /mnt/rootfs brotli libstdc++ coreutils glibc-minimal-langpack --releasever 8 --setopt install_weak_deps=false --nodocs -y && yum --installroot /mnt/rootfs clean all
RUN rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/dnf* /mnt/rootfs/var/log/yum.*

WORKDIR /mnt/rootfs

COPY --from=linux-musl-content --chown=0:0 /checode-linux-musl /mnt/rootfs/checode-linux-musl
COPY --from=linux-libc-ubi8-content --chown=0:0 /checode-linux-libc/ubi8 /mnt/rootfs/checode-linux-libc/ubi8
COPY --from=linux-libc-ubi9-content --chown=0:0 /checode-linux-libc/ubi9 /mnt/rootfs/checode-linux-libc/ubi9

RUN mkdir -p /mnt/rootfs/projects && mkdir -p /mnt/rootfs/home/che
RUN cat /mnt/rootfs/etc/passwd | sed s#root:x.*#root:x:\${USER_ID}:\${GROUP_ID}::\${HOME}:/bin/bash#g > /mnt/rootfs/home/che/.passwd.template \
    && cat /mnt/rootfs/etc/group | sed s#root:x:0:#root:x:0:0,\${USER_ID}:#g > /mnt/rootfs/home/che/.group.template
RUN for f in "/mnt/rootfs/home/che" "/mnt/rootfs/etc/group" "/mnt/rootfs/projects" ; do\
           chgrp -R 0 ${f} && \
           chmod -R g+rwX ${f}; \
       done
RUN chmod -R g-w /mnt/rootfs/etc/passwd

COPY --from=machine-exec --chown=0:0 /go/ubi8/bin/che-machine-exec /mnt/rootfs/checode-linux-libc/ubi8/machine-exec
COPY --from=machine-exec --chown=0:0 /go/ubi9/bin/che-machine-exec /mnt/rootfs/checode-linux-libc/ubi9/machine-exec
COPY --from=machine-exec --chown=0:0 /go/bin/che-machine-exec /mnt/rootfs/checode-linux-musl/machine-exec
# Version key of the assemblies, read by entrypoint-init-container.sh to skip the copy when unchanged
RUN cd /mnt/rootfs \
    && version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' checode-linux-libc/ubi9/package.json | head -1) \
    && hash=$(find checode-linux-musl checode-linux-libc -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1) \
    && printf '%s-%s' "$version" "$hash" > checode.version
COPY --chmod=755 /build/scripts/*.sh /mnt/rootfs/
# The init container must restore every file the launcher patches in place (launcher/src/files.ts)
RUN cd /mnt/rootfs \
    && patched=$(sed -n '/^PATCHED_FILES="/,/"$/p' entrypoint-init-container.sh | sed 's/^PATCHED_FILES="//; s/"$//') \
    && launcher=$(sed -n "s/^export const FILE_[A-Z_]* = '\(.*\)';/\1/p" checode-linux-libc/ubi9/launcher/files.js) \
    && [ -n "$launcher" ] \
    && for f in product.json $launcher; do \
         echo "$patched" | grep -qxF "$f" || { echo "[ERROR] $f is patched by the launcher but missing from PATCHED_FILES"; exit 1; }; \
       done
COPY --chmod=755 /build/remote-config /mnt/rootfs/remote/data/Machine/

# Create all-in-one image
FROM scratch
COPY --from=ubi-builder /mnt/rootfs/ /
ENV HOME=/home/che
USER 1001
ENTRYPOINT /entrypoint.sh
