#!/bin/bash
# This file was generated using AI assistance (Cursor AI) and reviewed by the maintainers.
#
# Wrapper that runs a single rebase.sh handler function against the working tree.
# Stubs git operations that require merge conflict state so handlers can run
# outside of an actual rebase.
#
# Usage: bash test-rebase-handler.sh <handler-function> [args...]
# Must be run from the repository root.
set -e
set -u

git() {
  if [[ "$1" == "checkout" || "$1" == "add" || "$1" == "diff" ]]; then
    return 0
  fi
  command git "$@"
}
export -f git

# Source function definitions from rebase.sh, stripping set -e/-u
# so the test harness controls error handling.
eval "$(sed -n '1,/^# perform rebase/p' rebase.sh | grep -v '^set -[eu]$')"

"$@"
