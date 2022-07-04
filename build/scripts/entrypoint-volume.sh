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

# Boilerplate code for arbitrary user support
if ! whoami &> /dev/null; then
  if [ -w /etc/passwd ]; then
    echo "${USER_NAME:-user}:x:$(id -u):0:${USER_NAME:-user} user:${HOME}:/bin/bash" >> /etc/passwd
    echo "${USER_NAME:-user}:x:$(id -u):" >> /etc/group
  fi
fi

# list checode
ls -la /checode/

# Start the machine-exec component in background
export MACHINE_EXEC_PORT=3333
nohup /checode/bin/machine-exec --url "0.0.0.0:${MACHINE_EXEC_PORT}" &
sleep 5

# Start the checode component based on musl or libc

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
    cd /checode/checode-linux-musl || exit
else
    cd /checode/checode-linux-libc || exit
fi

# Set the default path to the serverDataFolderName
# into a persistent volume
export VSCODE_AGENT_FOLDER=/checode/remote

if [ -z "$CODE_HOST" ]; then
  CODE_HOST="127.0.0.1"
fi

# Launch che without connection-token, security is managed by Che
./node out/server-main.js --host "${CODE_HOST}" --port 3100 --without-connection-token
