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

# --- Parse rebase.sh to build file→handler mapping ---
# Discovers mappings from two sources:
#   1. elif entries in resolve_conflicts() — parses the if/elif chain
#   2. .rebase/ rule files not covered by elif entries
# Output format: file_path|handler_func|args
parse_handlers() {
  local elif_list=""

  # 1. Parse resolve_conflicts() elif chain from rebase.sh
  #    Matches patterns like:  elif [[ "$conflictingFile" == "code/foo.ts" ]]; then
  #    followed by:              handler_func "$conflictingFile"
  #    or:                        handler_func_no_args
  local prev_file=""
  while IFS= read -r line; do
    # Match elif (or if) with file path
    if [[ "$line" =~ \[\[.*==.*\"([^\"]+)\".*\]\] ]]; then
      prev_file="${BASH_REMATCH[1]}"
      continue
    fi
    # Match handler call on the next line
    if [ -n "$prev_file" ]; then
      # Strip leading whitespace
      local trimmed="${line#"${line%%[![:space:]]*}"}"
      if [ -n "$trimmed" ] && [[ "$trimmed" != elif* ]] && [[ "$trimmed" != fi* ]] && [[ "$trimmed" != else* ]]; then
        # Extract function name (first word)
        local handler="${trimmed%% *}"
        # Extract args: replace $conflictingFile with the actual file path
        local args="${trimmed#* }"
        if [ "$args" = "$handler" ]; then
          args=""
        else
          args="${args//\"\$conflictingFile\"/$prev_file}"
          args="${args//\$conflictingFile/$prev_file}"
          args="${args//\"/}"
          args=$(echo $args)
        fi
        if ! echo "$elif_list" | grep -qxF "$prev_file"; then
          echo "$prev_file|$handler|$args"
          elif_list="${elif_list}${prev_file}"$'\n'
        fi
      fi
      prev_file=""
    fi
  done < <(sed -n '/^resolve_conflicts()/,/^}/p' rebase.sh)

  # 2. Files with .rebase/replace/ rules not in the elif chain
  find .rebase/replace -name '*.json' -type f 2>/dev/null | sort | while IFS= read -r rule_file; do
    local code_path="${rule_file#.rebase/replace/}"
    code_path="${code_path%.json}"
    if echo "$elif_list" | grep -qxF "$code_path"; then
      continue
    fi
    # Determine handler: multiline rules use perl, single-line use sed
    if jq -r '.[].from' "$rule_file" 2>/dev/null | grep -q $'\n'; then
      echo "$code_path|apply_changes_multi_line|$code_path"
    else
      echo "$code_path|apply_changes|$code_path"
    fi
  done

  # 3. Package.json files with add/override rules not covered above
  {
    find .rebase/add -name 'package.json' -type f 2>/dev/null
    find .rebase/override -name 'package.json' -type f 2>/dev/null
  } | sort -u | while IFS= read -r rule_file; do
    local code_path="${rule_file#.rebase/add/}"
    code_path="${code_path#.rebase/override/}"
    if echo "$elif_list" | grep -qxF "$code_path"; then
      continue
    fi
    if [ -f ".rebase/replace/${code_path}.json" ]; then
      continue
    fi
    # Detect tab formatting from rebase.sh elif chain or default to empty
    local fmt=""
    if grep -q "\"$code_path\"" rebase.sh && grep -A1 "\"$code_path\"" rebase.sh | grep -q '"tab"'; then
      fmt="tab"
    fi
    echo "$code_path|apply_package_changes_by_path|$code_path $fmt"
  done
}

# --- Cosmetic diff detection ---
# Returns 0 if the diff between two JSON files is only key reordering
# (same keys/values, different order) or indentation changes.
is_cosmetic_json_diff() {
  local file_a="$1"
  local file_b="$2"
  # If both files are valid JSON and parse to identical objects, the diff is cosmetic
  local sorted_a sorted_b
  sorted_a=$(jq -S '.' "$file_a" 2>/dev/null) || return 1
  sorted_b=$(jq -S '.' "$file_b" 2>/dev/null) || return 1
  [ "$sorted_a" = "$sorted_b" ]
}

# --- Test a single file ---
PASS=0
WARN=0
FAIL=0
SKIP=0
RESULTS_PASS=""
RESULTS_WARN=""
RESULTS_FAIL=""
RESULTS_SKIP=""

test_file() {
  local file_path="$1"
  local handler="$2"
  local handler_args_str="$3"

  local upstream_path="${file_path#code/}"
  local safe_name=$(echo "$file_path" | tr '/' '_')

  # Skip handlers that require npm install
  if [[ "$handler" =~ package_lock ]]; then
    RESULTS_SKIP+="- \`$file_path\` — Requires npm install\n"
    ((SKIP++))
    return
  fi

  if [ ! -f "$file_path" ]; then
    RESULTS_SKIP+="- \`$file_path\` — File not in working tree\n"
    ((SKIP++))
    return
  fi

  if ! command git show "upstream-code/$UPSTREAM_VERSION:$upstream_path" > /dev/null 2>&1; then
    RESULTS_SKIP+="- \`$file_path\` — File not in upstream\n"
    ((SKIP++))
    return
  fi

  cp "$file_path" "/tmp/expected-$safe_name"
  command git show "upstream-code/$UPSTREAM_VERSION:$upstream_path" > "$file_path"

  cleanup_test_file() {
    cp "/tmp/expected-$safe_name" "$file_path"
    rm -f "$file_path.bak"
  }
  trap cleanup_test_file EXIT

  local output handler_ok
  if [ -n "$handler_args_str" ]; then
    # shellcheck disable=SC2086
    output=$(bash "$HANDLER_SCRIPT" "$handler" $handler_args_str 2>&1) && handler_ok=true || handler_ok=false
  else
    output=$(bash "$HANDLER_SCRIPT" "$handler" 2>&1) && handler_ok=true || handler_ok=false
  fi

  if [ "$handler_ok" = true ]; then
    if diff "$file_path" "/tmp/expected-$safe_name" > "/tmp/diff-$safe_name" 2>&1; then
      RESULTS_PASS+="- \`$file_path\`\n"
      ((PASS++))
    elif diff -w -B "$file_path" "/tmp/expected-$safe_name" > /dev/null 2>&1; then
      RESULTS_WARN+="| \`$file_path\` | Whitespace or blank line difference |\n"
      ((WARN++))
    elif is_cosmetic_json_diff "$file_path" "/tmp/expected-$safe_name"; then
      RESULTS_WARN+="| \`$file_path\` | JSON key ordering or indentation |\n"
      ((WARN++))
    else
      local diff_lines
      diff_lines=$(wc -l < "/tmp/diff-$safe_name" | tr -d ' ')
      RESULTS_FAIL+="| \`$file_path\` | $handler | Diff: ${diff_lines} lines (see /tmp/diff-$safe_name) |\n"
      ((FAIL++))
    fi
  else
    RESULTS_FAIL+="| \`$file_path\` | $handler | Handler error: $(echo "$output" | tail -3 | tr '\n' ' ') |\n"
    ((FAIL++))
    echo "$output" > "/tmp/error-$safe_name"
  fi

  cleanup_test_file
  trap - EXIT
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
echo "**Summary: $PASS passed, $WARN warnings, $FAIL failed, $SKIP skipped**"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "### Failures"
  echo ""
  echo "| File | Handler | Details |"
  echo "|------|---------|---------|"
  echo -e "$RESULTS_FAIL"
fi

if [ $WARN -gt 0 ]; then
  echo ""
  echo "### Warnings"
  echo ""
  echo "| File | Details |"
  echo "|------|---------|"
  echo -e "$RESULTS_WARN"
fi

if [ $SKIP -gt 0 ]; then
  echo ""
  echo "### Skipped"
  echo ""
  echo -e "$RESULTS_SKIP"
fi

if [ $PASS -gt 0 ]; then
  echo ""
  echo "### Passed"
  echo ""
  echo -e "$RESULTS_PASS"
fi
