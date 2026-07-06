#!/bin/sh
# The following block was generated with AI assistance (Cursor AI)
# and reviewed by the maintainers.
#
# Ensure the bundled node can find its shared libraries (e.g. libnode.so).
# In Che, LD_LIBRARY_PATH may be sanitized in terminal sessions to avoid
# library version conflicts with user containers; restore the paths needed
# for the node binary scoped to this script only.
if [ -n "$VSCODE_GIT_EDITOR_NODE" ]; then
  EDITOR_NODE_DIR=$(dirname "$VSCODE_GIT_EDITOR_NODE")
  if [ -d "$EDITOR_NODE_DIR/ld_libs/core" ]; then
    LD_LIBRARY_PATH="$EDITOR_NODE_DIR/ld_libs/core${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    if [ -d "$EDITOR_NODE_DIR/ld_libs/openssl" ]; then
      LD_LIBRARY_PATH="$EDITOR_NODE_DIR/ld_libs/openssl:$LD_LIBRARY_PATH"
    fi
  elif [ -d "$EDITOR_NODE_DIR/ld_libs" ]; then
    LD_LIBRARY_PATH="$EDITOR_NODE_DIR/ld_libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
  export LD_LIBRARY_PATH
fi

ELECTRON_RUN_AS_NODE="1" \
"$VSCODE_GIT_EDITOR_NODE" "$VSCODE_GIT_EDITOR_MAIN" $VSCODE_GIT_EDITOR_EXTRA_ARGS "$@"
