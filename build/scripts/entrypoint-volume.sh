#!/bin/sh
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
  echo "Using linux-musl assembly..."
  cd /checode/checode-linux-musl || exit
else
  
  # detect openssl version
  openssl_major_version=""
  if command -v openssl &> /dev/null; then
    echo "OpenSSL command is available, the version is: $(openssl version -v)"  
    openssl_major_version=$(openssl version -v | cut -d' ' -f2 | cut -d'.' -f1)
  else 
    echo "OpenSSL command is not available, trying to detect OpenSSL version..."
    openssl_major_version=$(rpm -qa | grep openssl-libs | cut -d'-' -f3 | cut -d'.' -f1)
  fi
  
  # ubi8- or ubi9-based assembly is used depending on the openssl version
  echo "OpenSSL major version is $openssl_major_version."
  if [ "$openssl_major_version" = "1" ]; then
    echo "Using linux-libc ubi8-based assembly..."
    cd /checode/checode-linux-libc/ubi8 || exit
  elif [ "$openssl_major_version" = "3" ]; then
    export LD_LIBRARY_PATH="/checode/checode-linux-libc/ubi9/ld_libs:$LD_LIBRARY_PATH"
    echo "LD_LIBRARY_PATH is: $LD_LIBRARY_PATH"
    
    echo "Using linux-libc ubi9-based assembly..."
    cd /checode/checode-linux-libc/ubi9 || exit
  else
    echo "WARNING: Unsupported OpenSSL major version $openssl_major_version, linux-libc ubi8-based assembly will be used by default..."
    cd /checode/checode-linux-libc/ubi8 || exit
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
