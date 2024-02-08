# Copyright (c) 2022 Red Hat, Inc.
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

USER 10001

RUN echo "============================================================" && \
    ls -la /home && \
    echo "============================================================"
