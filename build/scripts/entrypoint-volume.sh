#!/bin/sh
#
# Copyright (c) 2021 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

# list checode-mount
ls -la /checode-mount/

# Start the machine-exec component in background
nohup /checode-mount/bin/machine-exec --url '0.0.0.0:3333' &
sleep 5

# Start the checode component based on musl or libc

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
    /checode-mount/checode-linux-musl/node /checode-mount/checode-linux-musl/out/vs/server/main.js --port 3100
else
    /checode-mount/checode-linux-libc/node /checode-mount/checode-linux-libc/out/vs/server/main.js --port 3100
fi


