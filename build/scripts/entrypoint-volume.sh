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
  sed -i -e "s|extensionsGallery:{serviceUrl:\"[^\"]*\",itemUrl:\"[^\"]*\"|extensionsGallery:{serviceUrl:\"${OPENVSX_URL}/gallery\",itemUrl:\"${OPENVSX_URL}/item\"|" out/vs/workbench/workbench.web.main.js
fi


# fetch che-code endpoint value from /devworkspace-metadata/flattened.devworkspace.yaml
CHE_CODE_ENDPOINT=$(yq -r '
  .components
  | to_entries[]
  | select(.value.attributes | to_entries[] | .key == "app.kubernetes.io/component" and .value == "che-code-runtime")
  | .value.container.endpoints
  | to_entries[]
  | select(.value.name == "che-code")
  | .value.attributes
  | to_entries[]
  | select(.key == "controller.devfile.io/endpoint-url")
  | .value
' /devworkspace-metadata/flattened.devworkspace.yaml)

if [ -z "$CHE_CODE_ENDPOINT" ]; then
  echo "Unable to fetch che-code endpoint from /devworkspace-metadata/flattened.devworkspace.yaml. Webviews will not work if CDN disabled."
fi

# To switch the webview content being loaded from local workspace we need to check for 'WEBVIEW_LOCAL_RESOURCES' environment variable.
if [ -n "${WEBVIEW_LOCAL_RESOURCES+x}" ]; then

  # If the variable is set to 'true', then:
  if [ "${WEBVIEW_LOCAL_RESOURCES}" == "true" ]; then

    if [ ! -z "$CHE_CODE_ENDPOINT" ]; then
      # make a valid base URI for webview static resources
      WEBVIEW_CONTENT_BASE_URL=$CHE_CODE_ENDPOINT"oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/"
      echo "Load webview static files from $WEBVIEW_CONTENT_BASE_URL"

      # fetch the existing base URI from product.json
      WEBVIEW_CONTENT_BASE_URL_TEMPLATE=$(jq -r '.webviewContentExternalBaseUrlTemplate' product.json)
      echo "WEBVIEW_CONTENT_BASE_URL_TEMPLATE: $WEBVIEW_CONTENT_BASE_URL_TEMPLATE"

      # escape special characters
      WORK_TEMPLATE=$WEBVIEW_CONTENT_BASE_URL_TEMPLATE
      WORK_TEMPLATE=${WORK_TEMPLATE//[\{]/\\{}
      WORK_TEMPLATE=${WORK_TEMPLATE//[\}]/\\\}}
      echo "WORK_TEMPLATE: $WORK_TEMPLATE"

      # apply new base URI to the following files
      sed -i -r -e "s|${WORK_TEMPLATE}|${WEBVIEW_CONTENT_BASE_URL}|" out/vs/workbench/workbench.web.main.js
      sed -i -r -e "s|${WORK_TEMPLATE}|${WEBVIEW_CONTENT_BASE_URL}|" out/vs/workbench/api/node/extensionHostProcess.js

      # actual value of webviewContentExternalBaseUrlTemplate in the product.json has no effect at runtime
      # it serves as a marker for easily verifying the source of the webview static resources
      sed -i -r -e "s|${WORK_TEMPLATE}|${WEBVIEW_CONTENT_BASE_URL}|" product.json
    fi
  fi
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
