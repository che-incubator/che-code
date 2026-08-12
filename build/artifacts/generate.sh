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
ALL_PACKAGES_LOCK_JSON="$SCRIPT_DIR/package-lock.json"
ALL_PACKAGES_JSON="$SCRIPT_DIR/package.json"

makeArtifactsLockYaml () {
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
    SHA256=$(jq -r '.builtInExtensions[] | select(.name=="'${PLUGIN}'") | .sha256' "$PRODUCT_JSON")
    PUBLISHER=$(echo "$PLUGIN" | cut -d '.' -f 1)
    NAME=$(echo "$PLUGIN" | cut -d '.' -f 2)
    DOWNLOAD_URL="https://open-vsx.org/api/${PUBLISHER}/${NAME}/${VERSION}/file/${PLUGIN}-${VERSION}.vsix"
    FILENAME="$PLUGIN.$VERSION.vsix"
    checkUrlExistence "$DOWNLOAD_URL"

    echo "  # $PLUGIN"                      >> "$ARTIFACTS_LOCK_YAML"
    echo "  - download_url: $DOWNLOAD_URL"  >> "$ARTIFACTS_LOCK_YAML"
    echo "    filename: $FILENAME"          >> "$ARTIFACTS_LOCK_YAML"
    echo "    checksum: sha256:$SHA256"     >> "$ARTIFACTS_LOCK_YAML"
  done
  
  echo "[INFO] Completed ${ARTIFACTS_LOCK_YAML}"
}

# Combine all package-lock.json files into a single file
makeAllPackageLockJson () {
  pushd "$ROOT_DIR" > /dev/null

  # Create a new package-lock.json based on the one from the root directory
  jq '. | del(.packages)' package-lock.json > "${ALL_PACKAGES_LOCK_JSON}"

  # Iterate over all package-lock.json files in the project
  find . -name "package-lock.json" -not -path "./build/*" | while read -r file; do
    echo "[INFO] Processing file: $file"

    # 1. Extract packages and remove empty one
    # 2. Add a new origin structure with package-lock.json file location and resolved fields (duplicates)
    jq --arg filename "$file" '.packages | del(."") | . |= with_entries(.value.origin = {location: $filename, resolved: .value.resolved})' "$file" > /tmp/package-lock.json

    # 3. Add something uniq to the key (package name) to avoid duplicates while merging packages below
    OUTPUT=$(jq --arg filehash "$(echo $file | sha256sum | awk '{print $1}')"  'to_entries | map({"\(.key)-\($filehash)": .value}) | add' /tmp/package-lock.json) && echo -n "${OUTPUT}" > /tmp/package-lock.json

    # 4. Merge package-lock.json files
    OUTPUT=$(jq '.packages += input' "${ALL_PACKAGES_LOCK_JSON}" /tmp/package-lock.json) && echo -n "${OUTPUT}" > "${ALL_PACKAGES_LOCK_JSON}"

    # 5. Sorting
    OUTPUT=$(jq -S '.' "${ALL_PACKAGES_LOCK_JSON}") && echo -n "${OUTPUT}" > "${ALL_PACKAGES_LOCK_JSON}"
  done

  echo "[INFO] Completed ${ALL_PACKAGES_LOCK_JSON}"

  jq '. | del(.scripts)' package.json > "${ALL_PACKAGES_JSON}"
  echo "[INFO] Completed ${ALL_PACKAGES_JSON}"

  popd > /dev/null
}

checkUrlExistence() {
  if curl -sfILo/dev/null "$1"; then
    echo "[INFO] Valid url: $1"
  else
    echo "[ERROR] Invalid url: $1"
    exit 1
  fi
}

run() {
  makeArtifactsLockYaml
  #makeAllPackageLockJson
}

run
