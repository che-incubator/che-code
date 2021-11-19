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

# list checode
ls -la /checode/

# Start the machine-exec component in background
nohup /checode/bin/machine-exec --url '0.0.0.0:3333' &
sleep 5

# Start the checode component based on musl or libc

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
    cd /checode/checode-linux-musl || exit
else
    cd /checode/checode-linux-libc || exit
fi

# Launch che with a custom connectionToken
./node out/vs/server/main.js --port 3100 --connectionToken eclipse-che
