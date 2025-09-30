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

libssl_version=""
get_libssl_version() {
  libssl=$(find / -type f \( -name "libssl.so*" \) 2>/dev/null)
  if [ -z "$libssl" ]; then
    for dir in /lib64 /usr/lib64 /lib /usr/lib /usr/local/lib64 /usr/local/lib; do
      for file in "$dir"/libssl.so*; do
        if [ -e "$file" ]; then
          libssl="$file"
          break 2
        fi
      done
    done
  fi

  echo "[INFO] libssl: $libssl"

  case "${libssl}" in
  *libssl.so.1*)
    echo "[INFO] libssl version is: 1"
    libssl_version="1"
    ;;
  *libssl.so.3*)
    echo "[INFO] libssl version is: 3"
    libssl_version="3"
    ;;
  *)
    libssl_version=""
    echo "[WARNING] unknown libssl version: $libssl"
    ;;
  esac
}

openssl_version=""
get_openssl_version() {
  if command -v openssl >/dev/null 2>&1; then
    echo "[INFO] openssl command is available, OpenSSL version is: $(openssl version -v)"
    openssl_version=$(openssl version -v | cut -d' ' -f2 | cut -d'.' -f1)
  elif command -v rpm >/dev/null 2>&1; then
    echo "[INFO] rpm command is available"
    openssl_version=$(rpm -qa | grep openssl-libs | cut -d'-' -f3 | cut -d'.' -f1)
  else
    echo "[INFO] openssl and rpm commands are not available, trying to detect OpenSSL version..."
    get_libssl_version
    openssl_version=$libssl_version
  fi
}

# Boilerplate code for arbitrary user support
if ! whoami >/dev/null 2>&1; then
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
  echo "[INFO] Using linux-musl assembly..."
  cd /checode/checode-linux-musl || exit
else

  get_openssl_version
  echo "[INFO] OpenSSL major version is: $openssl_version."

  case "${openssl_version}" in
  *"1"*)
    export LD_LIBRARY_PATH="/checode/checode-linux-libc/ubi8/ld_libs:$LD_LIBRARY_PATH"
    echo "[INFO] LD_LIBRARY_PATH is: $LD_LIBRARY_PATH"

    echo "[INFO] Using linux-libc ubi8-based assembly..."
    cd /checode/checode-linux-libc/ubi8 || exit
    ;;
  *"3"*)
    export LD_LIBRARY_PATH="/checode/checode-linux-libc/ubi9/ld_libs:$LD_LIBRARY_PATH"
    echo "[INFO] LD_LIBRARY_PATH is: $LD_LIBRARY_PATH"

    echo "[INFO] Using linux-libc ubi9-based assembly..."
    cd /checode/checode-linux-libc/ubi9 || exit
    ;;
  *)
    echo "[WARNING] Unsupported OpenSSL major version, linux-libc ubi9-based assembly will be used by default..."

    export LD_LIBRARY_PATH="/checode/checode-linux-libc/ubi9/ld_libs:$LD_LIBRARY_PATH"
    echo "[INFO] LD_LIBRARY_PATH is: $LD_LIBRARY_PATH"

    cd /checode/checode-linux-libc/ubi9 || exit
    ;;
  esac
fi

# Set the default path to the serverDataFolderName
# into a persistent volume
export VSCODE_AGENT_FOLDER=/checode/remote

if [ -z "$VSCODE_NODEJS_RUNTIME_DIR" ]; then
  export VSCODE_NODEJS_RUNTIME_DIR="$(pwd)"
fi

echo "[INFO] Node.js dir for running VS Code: $VSCODE_NODEJS_RUNTIME_DIR"

# Run launcher
"$VSCODE_NODEJS_RUNTIME_DIR/node" ./launcher/entrypoint.js
