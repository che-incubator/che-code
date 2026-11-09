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

set -e

# [TIMING] test-only: current time in milliseconds (falls back to seconds precision)
now_ms() {
  ms=$(date +%s%3N)
  case "$ms" in
    *N) echo $(( $(date +%s) * 1000 )) ;;
    *) echo "$ms" ;;
  esac
}
script_start=$(now_ms)

# Files the launcher patches in place on every start: always restore them from the image.
# Keep in sync with launcher/src/files.ts and launcher/src/product-json.ts.
PATCHED_FILES="product.json
out/vs/code/browser/workbench/workbench.js
out/vs/workbench/workbench.web.main.internal.js
out/vs/workbench/api/node/extensionHostProcess.js"
ASSEMBLIES="checode-linux-musl checode-linux-libc/ubi8 checode-linux-libc/ubi9"

# Copy checode stuff to the shared volume, unless the volume already holds this version
version=$(cat /checode.version)
if [ "$(cat /checode/.checode.version 2>/dev/null)" != "$version" ]; then
  echo "[INFO] Copying checode $version to the volume"
  # The marker goes first and comes back last: an interrupted copy is redone on the next start
  rm -f /checode/.checode.version
  t=$(now_ms)
  rm -rf /checode/checode-*
  echo "[TIMING] removing old assemblies from the volume: $(( $(now_ms) - t )) ms"
  t=$(now_ms)
  cp -r /checode-* /checode/
  echo "[TIMING] FULL COPY of assemblies to the volume: $(( $(now_ms) - t )) ms"
  printf '%s' "$version" > /checode/.checode.version
  echo "[TIMING] copied size (not timed): $(du -sh /checode/checode-* | tr '\n' ' ')"
else
  echo "[INFO] checode $version already on the volume, restoring patched files"
  t=$(now_ms)
  for assembly in $ASSEMBLIES; do
    for file in $PATCHED_FILES; do
      cp "/$assembly/$file" "/checode/$assembly/$file"
      rm -f "/checode/$assembly/$file.gz"
    done
  done
  echo "[TIMING] PATCHED FILES RESTORE (copy skipped): $(( $(now_ms) - t )) ms"
fi

# Copy entrypoint
t=$(now_ms)
cp /entrypoint-volume.sh /checode/
# Copy remote configuration
mkdir -p /checode/remote/data/Machine
cp /remote/data/Machine/settings.json /checode/remote/data/Machine/
echo "[TIMING] entrypoint + remote settings copy: $(( $(now_ms) - t )) ms"
echo "[TIMING] init container script total (before listing): $(( $(now_ms) - script_start )) ms"

echo "listing all files copied"
ls -la /checode
