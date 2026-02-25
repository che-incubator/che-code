# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# UBI 8
FROM registry.access.redhat.com/ubi8/ubi-minimal:8.10 as sshd-ubi8

USER 0

RUN microdnf -y install libsecret openssh-server nss_wrapper-libs \
      gzip tar which && \
    microdnf -y clean all --enablerepo='*'

# UBI 9/10
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:9.7

USER 0

RUN microdnf -y install libsecret openssh-server nss_wrapper-libs && \
    microdnf -y clean all --enablerepo='*'

RUN mkdir -p /sshd-staging/ubi8 /sshd-staging/ubi9
# UBI 8
COPY --from=sshd-ubi8 /usr/sbin/sshd /usr/bin/ssh-keygen /usr/bin/tar /usr/bin/gzip /usr/bin/which /usr/lib64/libnss_wrapper.so /usr/lib64/libpam.so.0 /sshd-staging/ubi8/
# UBI 9/10
RUN cp /usr/sbin/sshd /usr/bin/ssh-keygen /usr/bin/tar /usr/bin/gzip /usr/bin/which /usr/lib64/libnss_wrapper.so /usr/lib64/libpam.so.0 /usr/lib64/libeconf.so.0 /usr/lib64/libcrypt.so.2 /sshd-staging/ubi9/

# sshd_config is root:root 600
RUN chmod 644 /etc/ssh/sshd_config
RUN cp /etc/ssh/sshd_config /sshd-staging/

# Add script to start and stop the service
COPY --chown=0:0 /build/scripts/sshd.init /build/scripts/sshd.start /sshd-staging/

RUN mkdir /opt/www
COPY /build/scripts/code-sshd-page/* /opt/www/

# Lock down /etc/passwd until fixed in UDI
RUN chmod 644 /etc/passwd

EXPOSE 2022 3400

USER 10001
