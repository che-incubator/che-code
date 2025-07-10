# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/devfile/universal-developer-image:latest

USER 0

RUN dnf -y install libsecret openssh-server dropbear && \
    dnf -y clean all --enablerepo='*'

# Follow the sample https://www.golinuxcloud.com/run-sshd-as-non-root-user-without-sudo/

# Step 1. Generate SSH Host keys

RUN mkdir /opt/ssh

RUN ssh-keygen -q -N "" -t dsa -f /opt/ssh/ssh_host_dsa_key && \
    ssh-keygen -q -N "" -t rsa -b 4096 -f /opt/ssh/ssh_host_rsa_key && \
    ssh-keygen -q -N "" -t ecdsa -f /opt/ssh/ssh_host_ecdsa_key && \
    ssh-keygen -q -N "" -t ed25519 -f /opt/ssh/ssh_host_ed25519_key

RUN ls -l /opt/ssh/

# Step 2. Configure SSHH as non-root user

RUN cp /etc/ssh/sshd_config /opt/ssh/

# Use a non-privileged port
RUN sed -i 's|#Port 22|Port 2022|' /opt/ssh/sshd_config

# provide the new path containing these host keys
RUN sed -i 's|HostKey /etc/ssh/ssh_host_rsa_key|HostKey /opt/ssh/ssh_host_rsa_key|' /opt/ssh/sshd_config
RUN sed -i 's|HostKey /etc/ssh/ssh_host_ecdsa_key|HostKey /opt/ssh/ssh_host_ecdsa_key|' /opt/ssh/sshd_config
RUN sed -i 's|HostKey /etc/ssh/ssh_host_ed25519_key|HostKey /opt/ssh/ssh_host_ed25519_key|' /opt/ssh/sshd_config

RUN sed -i 's|#PubkeyAuthentication yes|PubkeyAuthentication yes|' /opt/ssh/sshd_config
RUN sed -i 's|AuthorizedKeysFile	.ssh/authorized_keys|AuthorizedKeysFile /home/user/ssh/authorized_keys|' /opt/ssh/sshd_config

# Enable DEBUG log. You can ignore this but this may help you debug any issue while enabling SSHD for the first time
RUN sed -i 's|#LogLevel INFO|LogLevel DEBUG3|' /opt/ssh/sshd_config

RUN sed -i 's|#StrictModes yes|StrictModes=no|' /opt/ssh/sshd_config


# Provide a path to store PID file which is accessible by normal user for write purpose
RUN sed -i 's|#PidFile /var/run/sshd.pid|PidFile /opt/ssh/sshd.pid|' /opt/ssh/sshd_config

RUN echo "account include base-account" > /etc/pam.d/sshd.pam


# Add script to start and stop the service
COPY --chown=0:0 /build/sshd.start /
COPY --chown=0:0 /build/sshd.connect /


# Step 4. Fix permissions
RUN chmod 644 /opt/ssh/*
RUN chmod 664 /opt/ssh/sshd_config
RUN chown -R user:root /opt/ssh/

RUN chmod 774 /opt/ssh

EXPOSE 2022

USER 10001
