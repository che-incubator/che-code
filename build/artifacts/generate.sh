#!/bin/bash
#
# Copyright (c) 2022-2024 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

set -e

SCRIPT_DIR=$(dirname "$0")
ROOT_DIR=$(realpath "$SCRIPT_DIR/../..")
ARTIFACTS_LOCK_YAML="$SCRIPT_DIR/artifacts.lock.yaml"

run () {
  rm -f $ARTIFACTS_LOCK_YAML

  echo "---"                >> "$ARTIFACTS_LOCK_YAML"
  echo "metadata:"          >> "$ARTIFACTS_LOCK_YAML"
  echo "  version: \"1.0\"" >> "$ARTIFACTS_LOCK_YAML"
  echo "artifacts:"         >> "$ARTIFACTS_LOCK_YAML"

  # Generate artifacts for built-in extensions
  PRODUCT_JSON="$ROOT_DIR/code/product.json"
  PLUGINS=$(jq -r '.builtInExtensions[] | .name' "$PRODUCT_JSON")
  for PLUGIN in $PLUGINS; do
    VERSION=$(jq -r '.builtInExtensions[] | select(.name=="'${PLUGIN}'") | .version' "$PRODUCT_JSON")
    REPOSITORY=$(jq -r '.builtInExtensions[] | select(.name=="'${PLUGIN}'") | .repo' "$PRODUCT_JSON")
    SHA256=$(jq -r '.builtInExtensions[] | select(.name=="'${PLUGIN}'") | .sha256' "$PRODUCT_JSON")

    if [[ ! $SHA256 == "null" ]]; then
      FILENAME="$PLUGIN.$VERSION.vsix"
      DOWNLOAD_URL="$REPOSITORY/releases/download/v$VERSION/$FILENAME"
      check_existance "$DOWNLOAD_URL"

      echo "  # $PLUGIN"                      >> "$ARTIFACTS_LOCK_YAML"
      echo "  - download_url: $DOWNLOAD_URL"  >> "$ARTIFACTS_LOCK_YAML"
      echo "    filename: $FILENAME"          >> "$ARTIFACTS_LOCK_YAML"
      echo "    checksum: sha256:$SHA256"     >> "$ARTIFACTS_LOCK_YAML"
    fi
  done

  # Generate artifacts for ripgrep dependency
  PACKAGE_LOCK_JSON="$ROOT_DIR/code/package-lock.json"
  VSCODE_RIPGREP_VERSION=$(grep '"node_modules/@vscode/ripgrep"' "$PACKAGE_LOCK_JSON" -A 2 | grep '"version"' | head -1 | cut -d '"' -f 4)
  POST_INSTALL_SCRIPT=$(curl -sSL https://raw.githubusercontent.com/microsoft/vscode-ripgrep/v${VSCODE_RIPGREP_VERSION}/lib/postinstall.js)
  VSIX_RIPGREP_PREBUILT_VERSION=$(echo "${POST_INSTALL_SCRIPT}" | grep "const VERSION" | cut -d"'" -f 2 )
  VSIX_RIPGREP_PREBUILT_MULTIARCH_VERSION=$(echo "${POST_INSTALL_SCRIPT}" | grep "const MULTI_ARCH_LINUX_VERSION" | cut -d"'" -f 2 )

  PLATFORMS=("ppc64le" "s390x" "x86_64")
  for PLATFORM in "${PLATFORMS[@]}"; do
    FILENAME="ripgrep-$PLATFORM"

    case $PLATFORM in
      'ppc64le') RG_ARCH_SUFFIX='powerpc64le-unknown-linux-gnu';;
      's390x') RG_ARCH_SUFFIX='s390x-unknown-linux-gnu';;
      'x86_64') RG_ARCH_SUFFIX='x86_64-unknown-linux-musl';;
    esac
    case $PLATFORM in
      'ppc64le' | 's390x') RG_VERSION=${VSIX_RIPGREP_PREBUILT_MULTIARCH_VERSION};;
      'x86_64') RG_VERSION="${VSIX_RIPGREP_PREBUILT_VERSION}";;
    esac

    DOWNLOAD_URL="https://github.com/microsoft/ripgrep-prebuilt/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_ARCH_SUFFIX}.tar.gz"
    check_existance "$DOWNLOAD_URL"

    read -r SHA256 rest <<< "$(curl -s "$DOWNLOAD_URL" | shasum -a 256)"

    echo "  # $FILENAME"                      >> "$ARTIFACTS_LOCK_YAML"
    echo "  - download_url: $DOWNLOAD_URL"    >> "$ARTIFACTS_LOCK_YAML"
    echo "    filename: $FILENAME"            >> "$ARTIFACTS_LOCK_YAML"
    echo "    checksum: sha256:$SHA256"       >> "$ARTIFACTS_LOCK_YAML"
  done

  echo "[INFO] Done"
}

check_existance() {
  if curl -sfILo/dev/null "$1"; then
    echo "[INFO] Valid url: $1"
  else
    echo "[ERROR] Invalid url: $1"
    exit 1
  fi
}

run
