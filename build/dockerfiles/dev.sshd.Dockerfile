# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/devfile/base-developer-image:latest

USER 0

RUN dnf -y install libsecret openssh-server nss_wrapper-libs nodejs && \
    dnf -y clean all --enablerepo='*'

# sshd_config is root:root 600
RUN chmod 644 /etc/ssh/sshd_config

# Add script to start and stop the service
COPY --chown=0:0 /build/scripts/sshd.start /

RUN mkdir /opt/www
COPY /build/scripts/code-sshd-page/* /opt/www/

# Lock down /etc/passwd until fixed in UDI
RUN chmod 644 /etc/passwd

EXPOSE 2022 3400

USER 10001
