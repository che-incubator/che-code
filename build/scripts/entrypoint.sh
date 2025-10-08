#!/bin/bash
#
# Copyright (c) 2021-2024 Red Hat, Inc.
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

if [ -z "$CODE_HOST" ]; then
  CODE_HOST="127.0.0.1"
fi

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
    /checode-linux-musl/node /checode-linux-musl/out/server-main.js --host "${CODE_HOST}" --port 3100
else
    /checode-linux-libc/ubi8/node /checode-linux-libc/ubi8/out/server-main.js --host "${CODE_HOST}" --port 3100
fi
