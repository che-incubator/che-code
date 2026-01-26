#!/bin/bash
#
# Copyright (c) 2021-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)

if ! grep -Fq "${USER_ID}" /etc/passwd; then
    # current user is an arbitrary
    # user (its uid is not in the
    # container /etc/passwd). Let's fix that
    cat ${HOME}/.passwd.template | \
    sed "s/\${USER_ID}/${USER_ID}/g" | \
    sed "s/\${GROUP_ID}/${GROUP_ID}/g" | \
    sed "s/\${HOME}/\/che-vscode/g" > /etc/passwd

    cat ${HOME}/.group.template | \
    sed "s/\${USER_ID}/${USER_ID}/g" | \
    sed "s/\${GROUP_ID}/${GROUP_ID}/g" | \
    sed "s/\${HOME}/\/che-vscode/g" > /etc/group
fi

if [ -z "$CODE_HOST" ]; then
  CODE_HOST="127.0.0.1"
fi

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
    /checode-linux-musl/node /checode-linux-musl/out/server-main.js --host "${CODE_HOST}" --port 3100
else
    export LD_LIBRARY_PATH="/checode-linux-libc/ubi8/ld_libs:$LD_LIBRARY_PATH"
    /checode-linux-libc/ubi8/node /checode-linux-libc/ubi8/out/server-main.js --host "${CODE_HOST}" --port 3100
fi
