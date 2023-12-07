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

# Start the checode component based on musl or libc

# detect if we're using alpine/musl
libc=$(ldd /bin/ls | grep 'musl' | head -1 | cut -d ' ' -f1)
if [ -n "$libc" ]; then
  cd /checode/checode-linux-musl || exit
else
  openssl_major_version=$(openssl version -v | cut -d' ' -f2 | cut -d'.' -f1)
  echo "OpenSSL major version is $openssl_major_version."

  if [ "$openssl_major_version" = "1" ]; then
    cd /checode/checode-linux-libc/ubi8 || exit
  elif [ "$openssl_major_version" = "3" ]; then
    cd /checode/checode-linux-libc/ubi9 || exit
  else
    echo "Error: Unsupported OpenSSL major version $openssl_major_version."
    exit 1
  fi
fi

# Set the default path to the serverDataFolderName
# into a persistent volume
export VSCODE_AGENT_FOLDER=/checode/remote

if [ -z "$VSCODE_NODEJS_RUNTIME_DIR" ]; then
  export VSCODE_NODEJS_RUNTIME_DIR="$(pwd)"
fi

echo "Node.js dir for running VS Code: $VSCODE_NODEJS_RUNTIME_DIR"

# Run launcher
"$VSCODE_NODEJS_RUNTIME_DIR/node" ./launcher/entrypoint.js
