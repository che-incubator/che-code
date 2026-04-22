#!/bin/bash
#
# Copyright (c) 2021 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Pre-rebase validation: discovers conflicts via trial merge, classifies each
# conflicting file, and generates .rebase/pre-rebase-report.md.
# Run this BEFORE rebase.sh to catch missing rebase rules early.

set -e
set -u

# ---------------------------------------------------------------------------
# Read upstream versions from rebase.sh
# ---------------------------------------------------------------------------
PREVIOUS_UPSTREAM_VERSION=$(grep '^PREVIOUS_UPSTREAM_VERSION=' rebase.sh | head -1 | cut -d'"' -f2)
CURRENT_UPSTREAM_VERSION=$(grep '^CURRENT_UPSTREAM_VERSION=' rebase.sh | head -1 | cut -d'"' -f2)

if [ -z "$PREVIOUS_UPSTREAM_VERSION" ] || [ -z "$CURRENT_UPSTREAM_VERSION" ]; then
  echo "ERROR: Could not read upstream versions from rebase.sh"
  exit 1
fi

echo "=== Pre-rebase validation ==="
echo "Previous upstream: ${PREVIOUS_UPSTREAM_VERSION}"
echo "Target upstream:   ${CURRENT_UPSTREAM_VERSION}"
echo ""

# ---------------------------------------------------------------------------
# Ensure upstream remote exists and is fetched
# ---------------------------------------------------------------------------
git remote get-url upstream-code > /dev/null 2>&1 || \
  git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code "${CURRENT_UPSTREAM_VERSION}"
git fetch upstream-code "${PREVIOUS_UPSTREAM_VERSION}"

UPSTREAM_SHA=$(git rev-parse "upstream-code/${CURRENT_UPSTREAM_VERSION}")
PREV_UPSTREAM_SHA=$(git rev-parse "upstream-code/${PREVIOUS_UPSTREAM_VERSION}")

echo "Previous upstream SHA: ${PREV_UPSTREAM_SHA}"
echo "Target upstream SHA:   ${UPSTREAM_SHA}"
echo ""

# ---------------------------------------------------------------------------
# Save current branch, stash changes, create temp branch, set up cleanup trap
# ---------------------------------------------------------------------------
ORIGINAL_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse HEAD)
STASH_NEEDED=false

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Stashing uncommitted changes..."
  git stash push -m "pre-rebase-check-stash" --include-untracked
  STASH_NEEDED=true
fi

cleanup() {
  echo ""
  echo "Cleaning up trial merge..."
  git merge --abort 2>/dev/null || true
  git reset --hard 2>/dev/null || true
  git clean -fd code/ 2>/dev/null || true
  git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
  git branch -D _pre_rebase_check 2>/dev/null || true
  if [ "$STASH_NEEDED" = true ]; then
    echo "Restoring stashed changes..."
    git stash pop 2>/dev/null || true
  fi
}
trap cleanup EXIT

git checkout -b _pre_rebase_check

# ---------------------------------------------------------------------------
# Attempt trial subtree merge
# ---------------------------------------------------------------------------
echo "Attempting trial subtree merge..."
set +e
merge_output=$(git subtree pull --prefix code upstream-code "$UPSTREAM_SHA" -m "trial merge" 2>&1)
merge_exit=$?
set -e

if [ $merge_exit -eq 0 ]; then
  echo "No conflicts detected! Rebase should be clean."
  git reset --hard HEAD~1
  local_upstream_short=$(echo "$CURRENT_UPSTREAM_VERSION" | sed 's|release/||')
  mkdir -p .rebase/reports
  cat > ".rebase/reports/pre-rebase-report-${local_upstream_short}.md" << REPORT_EOF
# Pre-Rebase Report

> Previous: ${PREVIOUS_UPSTREAM_VERSION} -> Target: ${CURRENT_UPSTREAM_VERSION}
> No conflicts detected. Rebase should be clean.
REPORT_EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# Collect conflicting files
# ---------------------------------------------------------------------------
CONFLICTS=$(git diff --name-only --diff-filter=U)

if [ -z "$CONFLICTS" ]; then
  echo "git subtree pull failed (exit code $merge_exit) but no file-level conflicts found."
  echo ""
  echo "Merge output:"
  echo "$merge_output"
  echo ""
  echo "This may indicate a subtree merge strategy issue. Try running rebase.sh directly."
  UPSTREAM_SHORT=$(echo "$CURRENT_UPSTREAM_VERSION" | sed 's|release/||')
  mkdir -p .rebase/reports
  cat > ".rebase/reports/pre-rebase-report-${UPSTREAM_SHORT}.md" << REPORT_EOF
# Pre-Rebase Report

> Previous: ${PREVIOUS_UPSTREAM_VERSION} -> Target: ${CURRENT_UPSTREAM_VERSION}
> git subtree pull failed (exit $merge_exit) but no file-level conflicts detected.
> This may indicate a subtree merge strategy issue. Try running rebase.sh directly.

## Merge output

\`\`\`
${merge_output}
\`\`\`
REPORT_EOF
  exit 1
fi

CONFLICT_COUNT=$(echo "$CONFLICTS" | wc -l | tr -d ' ')

echo "Found ${CONFLICT_COUNT} conflicting files"
echo ""

# ---------------------------------------------------------------------------
# Helper: check if a file has any .rebase/ rules
# ---------------------------------------------------------------------------
has_rebase_rules() {
  local file="$1"
  [ -f ".rebase/add/$file" ] || \
  [ -f ".rebase/override/$file" ] || \
  [ -f ".rebase/replace/$file.json" ]
}

# ---------------------------------------------------------------------------
# Helper: check if a file has an elif entry in resolve_conflicts()
# ---------------------------------------------------------------------------
has_elif_entry() {
  local file="$1"
  grep -q "\"$file\"" rebase.sh 2>/dev/null
}

# ---------------------------------------------------------------------------
# Classify each conflicting file
# ---------------------------------------------------------------------------
declare -a RULED_FILES=()
declare -a LOCK_FILES=()
declare -a TAKE_THEIRS_FILES=()
declare -a MISSING_ELIF_FILES=()
declare -a NEEDS_RULE_FILES=()
declare -a LOCK_WARNINGS=()

IFS=$'\n'
for file in $CONFLICTS; do
  # Category: package-lock.json
  if [[ "$file" == *package-lock.json ]]; then
    LOCK_FILES+=("$file")
    continue
  fi

  # Category: has rebase rules
  if has_rebase_rules "$file"; then
    if has_elif_entry "$file"; then
      RULED_FILES+=("$file")
    else
      MISSING_ELIF_FILES+=("$file")
    fi
    continue
  fi

  # No rules -- check for che-specific changes
  upstream_path="${file#code/}"
  our_content=$(git show "HEAD:${file}" 2>/dev/null || echo "__FILE_NOT_FOUND__")
  prev_upstream_content=$(git show "${PREV_UPSTREAM_SHA}:${upstream_path}" 2>/dev/null || echo "__FILE_NOT_FOUND__")

  if [ "$our_content" = "$prev_upstream_content" ]; then
    TAKE_THEIRS_FILES+=("$file")
  else
    NEEDS_RULE_FILES+=("$file")
  fi
done

# Check lock files: warn if corresponding package.json is in NEEDS_RULE
if [ ${#LOCK_FILES[@]} -gt 0 ] && [ ${#NEEDS_RULE_FILES[@]} -gt 0 ]; then
  for lockFile in "${LOCK_FILES[@]}"; do
    dir=$(dirname "$lockFile")
    pkg_json="$dir/package.json"
    for nr_file in "${NEEDS_RULE_FILES[@]}"; do
      if [ "$nr_file" = "$pkg_json" ]; then
        LOCK_WARNINGS+=("$lockFile -- corresponding $pkg_json has che-specific changes without rules!")
        break
      fi
    done
  done
fi

# ---------------------------------------------------------------------------
# Generate report
# ---------------------------------------------------------------------------
UPSTREAM_SHORT=$(echo "$CURRENT_UPSTREAM_VERSION" | sed 's|release/||')
mkdir -p .rebase/reports
REPORT=".rebase/reports/pre-rebase-report-${UPSTREAM_SHORT}.md"

cat > "$REPORT" << HEADER_EOF
# Pre-Rebase Report

> Previous: ${PREVIOUS_UPSTREAM_VERSION} -> Target: ${CURRENT_UPSTREAM_VERSION}
> Conflicts found: ${CONFLICT_COUNT}

## All conflicting files (raw list)

HEADER_EOF

for f in $CONFLICTS; do
  echo "- \`$f\`" >> "$REPORT"
done
echo "" >> "$REPORT"

# RULED
echo "## RULED - has rebase rules and elif entry (${#RULED_FILES[@]} files)" >> "$REPORT"
echo "" >> "$REPORT"
if [ ${#RULED_FILES[@]} -gt 0 ]; then
  for f in "${RULED_FILES[@]}"; do
    rule_types=""
    [ -f ".rebase/replace/$f.json" ] && rule_types="${rule_types} replace"
    [ -f ".rebase/add/$f" ] && rule_types="${rule_types} add"
    [ -f ".rebase/override/$f" ] && rule_types="${rule_types} override"
    echo "- \`$f\` --.rebase/${rule_types# } + elif OK" >> "$REPORT"
  done
else
  echo "_None_" >> "$REPORT"
fi
echo "" >> "$REPORT"

# LOCK
echo "## LOCK - package-lock.json, auto-handled (${#LOCK_FILES[@]} files)" >> "$REPORT"
echo "" >> "$REPORT"
if [ ${#LOCK_FILES[@]} -gt 0 ]; then
  for f in "${LOCK_FILES[@]}"; do
    echo "- \`$f\`" >> "$REPORT"
  done
else
  echo "_None_" >> "$REPORT"
fi
if [ ${#LOCK_WARNINGS[@]} -gt 0 ]; then
  echo "" >> "$REPORT"
  echo "**Warnings:**" >> "$REPORT"
  for w in "${LOCK_WARNINGS[@]}"; do
    echo "- ⚠️ \`$w\`" >> "$REPORT"
  done
fi
echo "" >> "$REPORT"

# TAKE_THEIRS
echo "## TAKE_THEIRS - no che changes, safe to take upstream (${#TAKE_THEIRS_FILES[@]} files)" >> "$REPORT"
echo "" >> "$REPORT"
if [ ${#TAKE_THEIRS_FILES[@]} -gt 0 ]; then
  for f in "${TAKE_THEIRS_FILES[@]}"; do
    echo "- \`$f\`" >> "$REPORT"
  done
else
  echo "_None_" >> "$REPORT"
fi
echo "" >> "$REPORT"

# MISSING_ELIF
echo "## MISSING_ELIF - has rebase rules but NO elif entry (${#MISSING_ELIF_FILES[@]} files)" >> "$REPORT"
echo "" >> "$REPORT"
if [ ${#MISSING_ELIF_FILES[@]} -gt 0 ]; then
  for f in "${MISSING_ELIF_FILES[@]}"; do
    rule_types=""
    [ -f ".rebase/replace/$f.json" ] && rule_types="${rule_types} replace"
    [ -f ".rebase/add/$f" ] && rule_types="${rule_types} add"
    [ -f ".rebase/override/$f" ] && rule_types="${rule_types} override"
    echo "- \`$f\` -- has .rebase/${rule_types# } rule, no elif in resolve_conflicts()" >> "$REPORT"
    echo "  Action: add elif entry or rely on smart fallback" >> "$REPORT"
  done
else
  echo "_None_" >> "$REPORT"
fi
echo "" >> "$REPORT"

# NEEDS_RULE
echo "## NEEDS_RULE - che-specific changes WITHOUT rules (${#NEEDS_RULE_FILES[@]} files)" >> "$REPORT"
echo "" >> "$REPORT"
if [ ${#NEEDS_RULE_FILES[@]} -gt 0 ]; then
  for f in "${NEEDS_RULE_FILES[@]}"; do
    upstream_path="${f#code/}"
    diff_stat=$(diff <(git show "${PREV_UPSTREAM_SHA}:${upstream_path}" 2>/dev/null) \
                     <(git show "HEAD:${f}" 2>/dev/null) 2>/dev/null | \
                grep -c '^[<>]' || echo "0")
    echo "- \`$f\`" >> "$REPORT"
    echo "  Diff lines: ~${diff_stat}" >> "$REPORT"
    echo "  Action: create rebase rule before running rebase.sh" >> "$REPORT"
  done
else
  echo "_None_" >> "$REPORT"
fi
echo "" >> "$REPORT"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "---"
echo "Report written to ${REPORT}"
echo ""
echo "Summary:"
echo "  RULED:        ${#RULED_FILES[@]}"
echo "  LOCK:         ${#LOCK_FILES[@]}"
echo "  TAKE_THEIRS:  ${#TAKE_THEIRS_FILES[@]}"
echo "  MISSING_ELIF: ${#MISSING_ELIF_FILES[@]}"
echo "  NEEDS_RULE:   ${#NEEDS_RULE_FILES[@]}"

if [ ${#NEEDS_RULE_FILES[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  ${#NEEDS_RULE_FILES[@]} file(s) have che-specific changes but no rebase rules!"
  echo "Create rules (using add-rebase-rules skill) before running rebase.sh."
  exit 1
fi

if [ ${#MISSING_ELIF_FILES[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  ${#MISSING_ELIF_FILES[@]} file(s) have rebase rules but no elif entry."
  echo "The smart fallback in rebase.sh will handle them, but explicit entries are recommended."
fi

echo ""
echo "✅ All conflicts can be auto-resolved. Ready to run rebase.sh."
exit 0
