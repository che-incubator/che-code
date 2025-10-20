# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/devfile/universal-developer-image:latest

USER 0

RUN dnf -y install libsecret openssh-server && \
    dnf -y clean all --enablerepo='*'

# Step 1. Generate SSH Host keys
RUN mkdir /opt/ssh
RUN chmod 755 /opt/ssh
RUN chown -R root:root /opt/ssh/

RUN ssh-keygen -q -N "" -t dsa -f /opt/ssh/ssh_host_dsa_key && \
    ssh-keygen -q -N "" -t rsa -b 4096 -f /opt/ssh/ssh_host_rsa_key && \
    ssh-keygen -q -N "" -t ecdsa -f /opt/ssh/ssh_host_ecdsa_key && \
    ssh-keygen -q -N "" -t ed25519 -f /opt/ssh/ssh_host_ed25519_key

# Step 2. Configure SSH as non-root user
RUN cp /etc/ssh/sshd_config /opt/ssh/

# Step 3. Fix permissions
RUN chmod 644 /opt/ssh/ssh_host_* /opt/ssh/sshd_config

# Use non-privileged port, set user authorized keys, disable strict checks
RUN sed -i \
-e 's|#Port 22|Port 2022|' \
-e 's|#StrictModes yes|StrictModes=no|' \
-e 's|#PidFile /var/run/sshd.pid|PidFile /tmp/sshd.pid|' \
-e 's|#LogLevel INFO|LogLevel DEBUG3|' \
  /opt/ssh/sshd_config

# Provide new path containing host keys
RUN sed -i \
-e 's|#HostKey /etc/ssh/ssh_host_rsa_key|HostKey /opt/ssh/ssh_host_rsa_key|' \
-e 's|#HostKey /etc/ssh/ssh_host_ecdsa_key|HostKey /opt/ssh/ssh_host_ecdsa_key|' \
-e 's|#HostKey /etc/ssh/ssh_host_ed25519_key|HostKey /opt/ssh/ssh_host_ed25519_key|' \
  /opt/ssh/sshd_config

# Add script to start and stop the service
COPY --chown=0:0 /build/scripts/sshd.start /

RUN mkdir /opt/www
COPY /build/scripts/code-sshd-page/* /opt/www/

# Lock down /etc/passwd until fixed in UDI
RUN chmod 644 /etc/passwd

# Bypass nologin shell for random generated user
RUN cp /bin/bash /sbin/nologin

EXPOSE 2022 3400

USER 10001
