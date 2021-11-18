#!/bin/bash
#
# Copyright (c) 2021 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
#!/bin/bash

# This script will rebase upstream code to our subtree in code directory
set -e
set -u

# update $1 json file
# $2 is the formatting option
override_json_file() {
  
  local filename=$1
  local formattingOption=${2:-}
  
  # now apply override settings
  jq --slurpfile override ".rebase/override/$filename" '. + $override[0]' "$filename" > "$filename.tmp"
  
  INDENT=("--indent" "2")
  if [[ "$formattingOption" == "tab" ]]; then
    INDENT=("--tab")
  fi
  
  # and now, add the values (not overriding)
  jq "${INDENT[@]}" -s '.[1] * .[0]' ".rebase/add/$filename" "$filename.tmp" > "$filename"
  
  # delete previous file
  rm "$filename.tmp"
}

# Apply changes on code/package.json file
apply_code_package_changes() {
  
  echo "  ⚙️  reworking code/package.json..."
  
  # reset the file from what is upstream
  git checkout --theirs code/package.json > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file code/package.json
  
  # resolve the change
  git add code/package.json > /dev/null 2>&1
}

# Apply changes on code/remote/package.json file
apply_code_remote_package_changes() {
  
  echo "  ⚙️ reworking code/remote/package.json..."
  
  # reset the file from what is upstream
  git checkout --theirs code/remote/package.json > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file code/remote/package.json
  
  # resolve the change
  git add code/remote/package.json > /dev/null 2>&1
}

# Apply changes on code/product.json file
apply_code_product_changes() {
  
  echo "  ⚙️ reworking code/product.json..."
  # reset the file from what is upstream
  git checkout --theirs code/product.json > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file code/product.json "tab"
  
  # resolve the change
  git add code/product.json > /dev/null 2>&1
}


# Will try to identify the conflicting files and for some of them it's easy to re-apply changes
resolve_conflicts() {
  echo "⚠️  There are conflicting files, trying to solve..."
  local -r conflictingFiles=$(git diff --name-only --diff-filter=U)
  
  # iterate on all conflicting files
  IFS=$'\n'
  for conflictingFile in $conflictingFiles; do
    echo " ➡️  Analyzing conflict for $conflictingFile"
    if [[ "$conflictingFile" == "code/package.json" ]]; then
      apply_code_package_changes
      elif [[ "$conflictingFile" == "code/product.json" ]]; then
      apply_code_product_changes
      elif [[ "$conflictingFile" == "code/remote/package.json" ]]; then
      apply_code_remote_package_changes
    else
      echo "$conflictingFile file cannot be automatically rebased. Aborting"
      exit 1
    fi
  done
  
}

# $1 is the upstream sha1 on which we're rebasing
continue_merge() {
  local -r conflictingFiles=$(git diff --name-only --diff-filter=U)
  if [ -z "${conflictingFiles}" ]; then
    echo "🚑  Conflicts have been solved. Continue to merge..."
    # use an empty editor to not edit the message
    GIT_EDITOR=: git merge --continue > /dev/null 2>&1
  else
    echo "Fail to resolve all conflicts. Exiting..."
    exit 1
  fi
}


# pull changes and if there are conflicts, resolve them
do_rebase() {
  
  echo "Using git $(which git) $(git --version)"
  # grab current upstream version
  UPSTREAM_VERSION=$(git rev-parse upstream-code/main)
  #UPSTREAM_VERSION=1.62.2
  
  # Grab current version
  if result=$(pull_changes "${UPSTREAM_VERSION}" 2>&1); then
    echo "🎉 rebase operation done successfully"
  else
    stderr=$result
    # do we have conflict ?
    if [[ "$stderr" =~ "CONFLICT" ]]; then
      resolve_conflicts
      continue_merge "$UPSTREAM_VERSION"
      echo "🚀  rebase successful after conflict solving"
    else
      echo "Unable to handle the error during rebase. Exiting..."
      printf "\n"
      echo "Error is :"
      echo "${stderr}"
      exit 1
    fi
  fi
}

# $1 is the revision to pull
pull_changes() {
  git subtree pull --prefix code upstream-code "$1" -m "$(get_commit_message "$1")"
}

# $1 is the revision
get_commit_message() {
  echo "Rebase against the upstream ${1}"
  echo "vscode-upstream-sha1: ${1}"
}

# perform rebase
do_rebase
