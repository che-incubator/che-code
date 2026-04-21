#!/bin/bash
# This file was generated using AI assistance (Cursor AI) and reviewed by the maintainers.
#
# End-to-end test for all rebase rules.
#
# Automatically parses resolve_conflicts() in rebase.sh to discover every
# file→handler mapping, then for each file:
#   1. Saves the current working-tree copy as the expected result
#   2. Places upstream content (simulating git checkout --theirs)
#   3. Runs the handler via test-rebase-handler.sh
#   4. Diffs the result against expected
#   5. Restores the original file
#
# Usage:
#   bash run-all-tests.sh                    # test all files
#   bash run-all-tests.sh code/product.json  # test specific file(s)
#
# Prerequisites:
#   - upstream-code remote must exist and be fetched
#   - Run from repository root, or the script will cd there automatically
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

HANDLER_SCRIPT="$SCRIPT_DIR/test-rebase-handler.sh"

UPSTREAM_VERSION=$(grep '^CURRENT_UPSTREAM_VERSION=' rebase.sh | head -1 | sed 's/.*="\(.*\)"/\1/')
if [ -z "$UPSTREAM_VERSION" ]; then
  echo "ERROR: Could not extract CURRENT_UPSTREAM_VERSION from rebase.sh"
  exit 1
fi

# --- Parse resolve_conflicts to build file→handler mapping ---
# Output format: file_path|handler_func|arg  (arg is empty or the file_path)
parse_handlers() {
  local in_func=0
  local current_file=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^resolve_conflicts\(\) ]]; then
      in_func=1
      continue
    fi
    if [[ $in_func -eq 0 ]]; then
      continue
    fi
    if [[ "$line" =~ ^\} ]]; then
      break
    fi

    # Match: "$conflictingFile" == "some/path"
    if [[ "$line" =~ \"\$conflictingFile\"[[:space:]]*==[[:space:]]*\"([^\"]+)\" ]]; then
      current_file="${BASH_REMATCH[1]}"
      continue
    fi

    # Match handler call on the line after the file match
    if [[ -n "$current_file" && "$line" =~ ^[[:space:]]+(apply_[a-zA-Z_]+) ]]; then
      local handler="${BASH_REMATCH[1]}"
      if [[ "$line" =~ \$conflictingFile ]]; then
        echo "$current_file|$handler|$current_file"
      else
        echo "$current_file|$handler|"
      fi
      current_file=""
    fi
  done < rebase.sh
}

# --- Test a single file ---
PASS=0
FAIL=0
SKIP=0
RESULTS=""

test_file() {
  local file_path="$1"
  local handler="$2"
  local handler_arg="$3"

  local upstream_path="${file_path#code/}"
  local safe_name=$(echo "$file_path" | tr '/' '_')

  # Skip handlers that require npm install
  if [[ "$handler" =~ package_lock ]]; then
    RESULTS+="| \`$file_path\` | SKIP | Requires npm install |\n"
    ((SKIP++))
    return
  fi

  if [ ! -f "$file_path" ]; then
    RESULTS+="| \`$file_path\` | SKIP | File not in working tree |\n"
    ((SKIP++))
    return
  fi

  if ! command git show "upstream-code/$UPSTREAM_VERSION:$upstream_path" > /dev/null 2>&1; then
    RESULTS+="| \`$file_path\` | SKIP | File not in upstream |\n"
    ((SKIP++))
    return
  fi

  cp "$file_path" "/tmp/expected-$safe_name"
  command git show "upstream-code/$UPSTREAM_VERSION:$upstream_path" > "$file_path"

  local output handler_ok
  if [ -n "$handler_arg" ]; then
    output=$(bash "$HANDLER_SCRIPT" "$handler" "$handler_arg" 2>&1) && handler_ok=true || handler_ok=false
  else
    output=$(bash "$HANDLER_SCRIPT" "$handler" 2>&1) && handler_ok=true || handler_ok=false
  fi

  if [ "$handler_ok" = true ]; then
    if diff "$file_path" "/tmp/expected-$safe_name" > "/tmp/diff-$safe_name" 2>&1; then
      RESULTS+="| \`$file_path\` | PASS | Exact match |\n"
      ((PASS++))
    elif diff -Z -B "$file_path" "/tmp/expected-$safe_name" > /dev/null 2>&1; then
      RESULTS+="| \`$file_path\` | PASS | Match (whitespace-only diff) |\n"
      ((PASS++))
    else
      local diff_lines
      diff_lines=$(wc -l < "/tmp/diff-$safe_name" | tr -d ' ')
      RESULTS+="| \`$file_path\` | **FAIL** | Diff: ${diff_lines} lines (see /tmp/diff-$safe_name) |\n"
      ((FAIL++))
    fi
  else
    RESULTS+="| \`$file_path\` | **FAIL** | Handler error: $(echo "$output" | tail -3 | tr '\n' ' ') |\n"
    ((FAIL++))
    echo "$output" > "/tmp/error-$safe_name"
  fi

  cp "/tmp/expected-$safe_name" "$file_path"
}

# --- Main ---
echo "=== Rebase Rules Test ==="
echo "Upstream: $UPSTREAM_VERSION"
echo ""

FILTER_FILES=("${@+"$@"}")

MAPPINGS=()
while IFS= read -r line; do
  MAPPINGS+=("$line")
done < <(parse_handlers)

total=${#MAPPINGS[@]}
i=1
for mapping in "${MAPPINGS[@]}"; do
  IFS='|' read -r file_path handler handler_arg <<< "$mapping"

  if [ ${#FILTER_FILES[@]} -gt 0 ]; then
    match=false
    for filter in "${FILTER_FILES[@]}"; do
      if [[ "$file_path" == "$filter" ]]; then
        match=true
        break
      fi
    done
    if [ "$match" = false ]; then
      continue
    fi
  fi

  echo "[$i/$total] $file_path ($handler)..."
  test_file "$file_path" "$handler" "$handler_arg"
  ((i++))
done

echo ""
echo "========================================="
echo "## Rebase Rules Test Results"
echo ""
echo "| File | Result | Details |"
echo "|------|--------|---------|"
echo -e "$RESULTS"
echo ""
echo "**Summary: $PASS passed, $FAIL failed, $SKIP skipped**"
