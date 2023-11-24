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

# Copy checode stuff to the shared volume
cp -r /checode-* /checode/
# Copy machine-exec as well
mkdir -p /checode/bin
cp /bin/machine-exec /checode/bin/
# Copy entrypoint
cp /entrypoint-volume.sh /checode/
# Copy remote configuration
mkdir -p /checode/remote
cp -r /remote /checode

echo "listing all files copied"
ls -la /checode

