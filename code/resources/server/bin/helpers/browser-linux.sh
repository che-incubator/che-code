#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#
ROOT="$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")"

APP_NAME="@@APPNAME@@"
VERSION="@@VERSION@@"
COMMIT="@@COMMIT@@"
EXEC_NAME="@@APPNAME@@"
CLI_SCRIPT="$ROOT/out/server-cli.js"

# The following block was generated with AI assistance (Cursor AI)
# and reviewed by the maintainers.
#
# Ensure the bundled node can find its shared libraries (e.g. libnode.so).
# In Che, LD_LIBRARY_PATH may be sanitized in terminal sessions to avoid
# library version conflicts with user containers; restore the paths needed
# for the node binary scoped to this script only.
if [ -d "$ROOT/ld_libs/core" ]; then
  LD_LIBRARY_PATH="$ROOT/ld_libs/core${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  if [ -d "$ROOT/ld_libs/openssl" ]; then
    LD_LIBRARY_PATH="$ROOT/ld_libs/openssl:$LD_LIBRARY_PATH"
  fi
elif [ -d "$ROOT/ld_libs" ]; then
  LD_LIBRARY_PATH="$ROOT/ld_libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
export LD_LIBRARY_PATH

"$ROOT/node" "$CLI_SCRIPT" "$APP_NAME" "$VERSION" "$COMMIT" "$EXEC_NAME" "--openExternal" "$@"
