#!/bin/bash
#
# Copyright (c) 2026 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Post-rebase verification script.
# Detects files that git subtree merge auto-resolved incorrectly.
# Files without Che-specific rebase rules must be identical to upstream.
# Differences are reported; overwriting requires --apply.
#
# Usage: bash post-rebase.sh [--dry-run|--apply]
#   --dry-run: only report differences, do not overwrite files (default)
#   --apply: overwrite mismatched files with upstream content

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments (dry-run by default; overwriting is opt-in)
DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=false
fi

# Read versions from rebase.sh
PREVIOUS_UPSTREAM_VERSION=$(grep '^PREVIOUS_UPSTREAM_VERSION=' "$SCRIPT_DIR/rebase.sh" | cut -d'"' -f2)
CURRENT_UPSTREAM_VERSION=$(grep '^CURRENT_UPSTREAM_VERSION=' "$SCRIPT_DIR/rebase.sh" | cut -d'"' -f2)

if [[ -z "$PREVIOUS_UPSTREAM_VERSION" || -z "$CURRENT_UPSTREAM_VERSION" ]]; then
  echo "ERROR: Could not read PREVIOUS_UPSTREAM_VERSION or CURRENT_UPSTREAM_VERSION from rebase.sh"
  exit 1
fi

# Prefix with remote name for git commands
PREV_REF="upstream-code/$PREVIOUS_UPSTREAM_VERSION"
CURR_REF="upstream-code/$CURRENT_UPSTREAM_VERSION"

echo "Previous upstream: $PREV_REF"
echo "Current upstream:  $CURR_REF"
echo ""

# Build exclusion list (one file path per line in a temp file)
EXCLUSION_FILE=$(mktemp)
trap "rm -f $EXCLUSION_FILE" EXIT

# 1. Files with .rebase/replace/ rules (strip .rebase/replace/ prefix and trailing .json)
find "$SCRIPT_DIR/.rebase/replace/" -name "*.json" 2>/dev/null | while IFS= read -r rule_file; do
  rel="${rule_file#$SCRIPT_DIR/.rebase/replace/}"
  echo "${rel%.json}"
done >> "$EXCLUSION_FILE"

# 2. Files with .rebase/add/ entries
find "$SCRIPT_DIR/.rebase/add/" -type f 2>/dev/null | while IFS= read -r add_file; do
  echo "${add_file#$SCRIPT_DIR/.rebase/add/}"
done >> "$EXCLUSION_FILE"

# 3. Files with .rebase/override/ entries
find "$SCRIPT_DIR/.rebase/override/" -type f 2>/dev/null | while IFS= read -r override_file; do
  echo "${override_file#$SCRIPT_DIR/.rebase/override/}"
done >> "$EXCLUSION_FILE"

# 4. Files from elif entries in rebase.sh
grep 'elif \[\[.*\$conflictingFile.*==.*"' "$SCRIPT_DIR/rebase.sh" | \
  sed 's/.*== "//; s/".*//' >> "$EXCLUSION_FILE"

EXCLUSION_COUNT=$(wc -l < "$EXCLUSION_FILE" | tr -d ' ')
echo "Exclusion list: $EXCLUSION_COUNT files with Che-specific rules"
echo ""

# Get list of files changed between previous and current upstream
CHANGED_FILES=$(git diff --name-only "$PREV_REF" "$CURR_REF" 2>/dev/null)
if [[ -z "$CHANGED_FILES" ]]; then
  echo "ERROR: Could not get changed files. Ensure upstream-code remote is fetched."
  echo "  git fetch upstream-code $PREVIOUS_UPSTREAM_VERSION $CURRENT_UPSTREAM_VERSION"
  exit 1
fi
TOTAL_CHANGED=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
echo "Files changed between upstream versions: $TOTAL_CHANGED"
echo ""

# Counters
checked=0
fixed=0
skipped_rules=0
skipped_lock=0
skipped_missing=0
skipped_deleted=0

# Temp file for fixed files list
FIXED_LIST=$(mktemp)
trap "rm -f $EXCLUSION_FILE $FIXED_LIST" EXIT

echo "Scanning..."

while IFS= read -r upstream_file; do
  [[ -z "$upstream_file" ]] && continue

  local_file="code/$upstream_file"

  # Skip package-lock.json files (regenerated separately)
  if [[ "$upstream_file" == */package-lock.json || "$upstream_file" == "package-lock.json" ]]; then
    skipped_lock=$((skipped_lock + 1))
    continue
  fi

  # Skip files with Che-specific rules (check exclusion list)
  if grep -qxF "$local_file" "$EXCLUSION_FILE" 2>/dev/null; then
    skipped_rules=$((skipped_rules + 1))
    continue
  fi

  # Check if file exists in upstream at current version
  if ! git cat-file -e "$CURR_REF:$upstream_file" 2>/dev/null; then
    skipped_deleted=$((skipped_deleted + 1))
    continue
  fi

  # Check if file exists locally
  if [[ ! -f "$SCRIPT_DIR/$local_file" ]]; then
    skipped_missing=$((skipped_missing + 1))
    continue
  fi

  checked=$((checked + 1))

  # Compare upstream with local using git hash-object for efficiency
  upstream_hash=$(git rev-parse "$CURR_REF:$upstream_file" 2>/dev/null)
  local_hash=$(git hash-object "$SCRIPT_DIR/$local_file" 2>/dev/null)

  if [[ "$upstream_hash" != "$local_hash" ]]; then
    fixed=$((fixed + 1))
    echo "$local_file" >> "$FIXED_LIST"

    if [[ "$DRY_RUN" == "false" ]]; then
      git show "$CURR_REF:$upstream_file" > "$SCRIPT_DIR/$local_file"
    fi
  fi
done <<< "$CHANGED_FILES"

echo ""
echo "========================================="
echo "Results:"
echo "  Checked:                      $checked"
echo "  Fixed (auto-resolution errors): $fixed"
echo "  Skipped (have rules):         $skipped_rules"
echo "  Skipped (lock files):         $skipped_lock"
echo "  Skipped (deleted in upstream): $skipped_deleted"
echo "  Skipped (missing locally):    $skipped_missing"
echo "========================================="

if [[ "$DRY_RUN" == "true" && $fixed -gt 0 ]]; then
  echo ""
  echo "DRY RUN mode — files were NOT overwritten. Run with --apply to fix."
fi

# Generate report
VERSION_SHORT="${CURRENT_UPSTREAM_VERSION#release/}"
REPORT_DIR="$SCRIPT_DIR/.rebase/$VERSION_SHORT"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/post-rebase-report.md"

{
  echo "# Post-Rebase Verification Report"
  echo ""
  echo "**Date:** $(date +%Y-%m-%d)"
  echo "**Previous upstream:** $PREVIOUS_UPSTREAM_VERSION"
  echo "**Current upstream:** $CURRENT_UPSTREAM_VERSION"
  echo "**Mode:** $(if [[ "$DRY_RUN" == "true" ]]; then echo "dry-run"; else echo "fix"; fi)"
  echo ""
  echo "## Summary"
  echo ""
  echo "| Metric | Count |"
  echo "|--------|-------|"
  echo "| Files changed in upstream | $TOTAL_CHANGED |"
  echo "| Files checked (no rules) | $checked |"
  echo "| Files fixed (auto-resolution errors) | $fixed |"
  echo "| Skipped (have Che-specific rules) | $skipped_rules |"
  echo "| Skipped (package-lock.json) | $skipped_lock |"
  echo "| Skipped (deleted in upstream) | $skipped_deleted |"
  echo "| Skipped (missing locally) | $skipped_missing |"
  echo ""

  if [[ $fixed -gt 0 ]]; then
    echo "## Detected Mismatches"
    echo ""
    while IFS= read -r fixed_file; do
      echo "- \`$fixed_file\`"
    done < "$FIXED_LIST"
    echo ""
    echo "## Diffs"
    echo ""
    while IFS= read -r fixed_file; do
      upstream_path="${fixed_file#code/}"
      echo "### \`$fixed_file\`"
      echo ""
      echo "\`\`\`diff"
      # Show first 50 lines of diff (upstream vs our broken version from git)
      diff <(git show "$CURR_REF:$upstream_path") <(git show HEAD:"$fixed_file") 2>/dev/null | head -50
      echo "\`\`\`"
      echo ""
    done < "$FIXED_LIST"
  else
    echo "## Result"
    echo ""
    echo "All files without Che-specific rules are identical to upstream. No mismatches detected."
  fi
} > "$REPORT_FILE"

echo ""
echo "Report saved to: $REPORT_FILE"

if [[ $fixed -gt 0 ]]; then
  echo ""
  echo "Fixed files:"
  while IFS= read -r f; do
    echo "  - $f"
  done < "$FIXED_LIST"
fi
