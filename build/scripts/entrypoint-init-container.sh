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

# Copy checode stuff to the shared volume, unless the volume already holds this version
version=$(cat /checode.version)
if [ "$(cat /checode/.checode.version 2>/dev/null)" != "$version" ]; then
  echo "[INFO] Copying checode $version to the volume"
  # The marker goes first and comes back last: an interrupted copy is redone on the next start
  rm -f /checode/.checode.version
  rm -rf /checode/checode-*
  cp -r /checode-* /checode/
  printf '%s' "$version" > /checode/.checode.version
else
  echo "[INFO] checode $version already on the volume"
fi

# Copy entrypoint
cp /entrypoint-volume.sh /checode/
# Copy remote configuration
mkdir -p /checode/remote/data/Machine
cp /remote/data/Machine/settings.json /checode/remote/data/Machine/

echo "listing all files copied"
ls -la /checode
