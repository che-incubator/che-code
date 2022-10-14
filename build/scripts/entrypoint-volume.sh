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

# First, check if OPENVSX_REGISTRY_URL environment variable is defined
# If it is, then it means CheServer has a way to provide this information
if [ -n "${OPENVSX_REGISTRY_URL+x}" ]; then

  # now check if it's empty, in that case we use Plugin Registry OpenVSX
  if [ -z "$OPENVSX_REGISTRY_URL" ]; then
    # remove the suffix /v3 from this variable
    CHE_PLUGIN_REGISTRY_ROOT_URL=${CHE_PLUGIN_REGISTRY_URL%/v3}

    # Use OpenVSX of the plug-in registry
    OPENVSX_URL="$CHE_PLUGIN_REGISTRY_ROOT_URL/openvsx/vscode"
  else
    # Use OpenVSX URL provided by the env variable
    OPENVSX_URL="$OPENVSX_REGISTRY_URL/vscode"
  fi
  echo "using OPENVSX_URL=$OPENVSX_URL"
  sed -i -r -e "s|\"serviceUrl\": \"..*\"|\"serviceUrl\": \"${OPENVSX_URL}/gallery\"|" product.json
  sed -i -r -e "s|\"itemUrl\": \"..*\"|\"itemUrl\": \"${OPENVSX_URL}/item\"|" product.json
  sed -i -e "s|serviceUrl:\".*\",itemUrl:\".*\"},version|serviceUrl:\"${OPENVSX_URL}/gallery\",itemUrl:\"${OPENVSX_URL}/item\"},version|" out/vs/workbench/workbench.web.main.js
fi

# Check if we have a custom CA certificate
if [ -f /tmp/che/secret/ca.crt ]; then
  echo "Adding custom CA certificate"
  export NODE_EXTRA_CA_CERTS=/tmp/che/secret/ca.crt
fi

if [ -z "$VSCODE_NODEJS_RUNTIME_DIR" ]; then
  VSCODE_NODEJS_RUNTIME_DIR="$(pwd)" 
fi

echo "Node.js dir for running VS Code: $VSCODE_NODEJS_RUNTIME_DIR"

# Launch che without connection-token, security is managed by Che
"$VSCODE_NODEJS_RUNTIME_DIR/node" out/server-main.js --host "${CODE_HOST}" --port 3100 --without-connection-token --default-folder ${PROJECT_SOURCE}
