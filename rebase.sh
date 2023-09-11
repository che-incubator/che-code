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
  
  INDENT=("--indent" "2")
  if [[ "$formattingOption" == "tab" ]]; then
    INDENT=("--tab")
  fi

  # now apply override settings
  local overrideFile=".rebase/override/$filename"
  if [ -f "$overrideFile" ]; then
    echo "  ⚙️  applying override settings from $overrideFile..."
    jq "${INDENT[@]}" -s '.[0] * .[1]' "$filename" "$overrideFile" > "$filename.tmp"
    cat "$filename.tmp" > "$filename"
  fi
  
  # and now, add the values (not overriding)
  local addFile=".rebase/add/$filename"
  if [ -f "$addFile" ]; then
    echo "  ⚙️  adding values from $addFile..."
    jq "${INDENT[@]}" -s '.[1] * .[0]' "$addFile" "$filename" > "$filename.tmp"
    cat "$filename.tmp" > "$filename"
  fi
  
  # delete previous file
  rm "$filename.tmp"
}

escape_litteral() {
    escaped=${1//\$/\\$}
    escaped=${escaped//\[/\\[}
    escaped=${escaped//\]/\\]}
    echo "$escaped"
}

# appy some string replace in $1 file
apply_replace() {
  
  local -r filename=$1
  
  local -r replaceSettings=".rebase/replace/$filename.json"
  
  # get one replace instruction on each line
  local -r replaceCommands=$(jq -c '.[]' "${replaceSettings}")
  
  IFS=$'\n'
  local from
  local by
  for replaceCommand in $replaceCommands; do
    # need to replace from by the by
    from=$(jq -n "$replaceCommand" | jq -r '.from')
    by=$(jq -n "$replaceCommand" | jq -r '.by')

    escape_from=$(escape_litteral "$from")
    escape_by=$(escape_litteral "$by")
    sed -i.bak -e "s|${escape_from}|${escape_by}|" "${filename}"
    if diff "$filename" "$filename.bak" &> /dev/null; then
      echo "Unable to perform the replace. Value is not present in the resulting file"
      echo "Wanted to check ${from}"
      echo "File content is"
      cat "${filename}"
      exit 1
    fi
    rm "$filename.bak"
  done

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

# Apply changes on $1 package.json file
# A path to the file should be passed, for example: code/build/package.json 
apply_package_changes_by_path() {
  local filePath="$1"
  
  if [ -z "$filePath" ]; then
     echo "Can not apply changes for package.json file - the path was not passed"
     exit 1;
  fi

  echo "  ⚙️ reworking $filePath..."
  
  # reset the file from what is upstream
  git checkout --theirs $filePath > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file $filePath
  
  # resolve the change
  git add $filePath > /dev/null 2>&1
}

# Apply changes on code/remote/yarn.lock file
apply_code_remote_yarn_lock_changes() {

  echo "  ⚙️ reworking code/remote/yarn.lock..."
  
  # reset the file from what is upstream
  git checkout --theirs code/remote/yarn.lock > /dev/null 2>&1

  # update yarn lock
  yarn --ignore-scripts --cwd code/remote

  # resolve the change
  git add code/remote/yarn.lock > /dev/null 2>&1

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

# Apply changes on code/build/lib/mangle/index.js file
apply_mangle_index_js_changes() {
  
  echo "  ⚙️ reworking code/build/lib/mangle/index.js..."
  # reset the file from what is upstream
  git checkout --theirs code/build/lib/mangle/index.js > /dev/null 2>&1

  # the actual changes are in the code/build/lib/mangle/index.ts file  
  (cd code/build && yarn compile)

  # resolve the change
  git add code/build/lib/mangle/index.js > /dev/null 2>&1
}

# Apply changes on code/build/lib/mangle/index.ts file
apply_mangle_index_ts_changes() {
  
  echo "  ⚙️ reworking code/build/lib/mangle/index.ts..."
  # reset the file from what is upstream
  git checkout --theirs code/build/lib/mangle/index.ts > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/build/lib/mangle/index.ts

  # apply changes for the code/build/lib/mangle/index.js file
  (cd code/build && yarn compile)
  
  # resolve the change
  git add code/build/lib/mangle/index.ts > /dev/null 2>&1
  git add code/build/lib/mangle/index.js > /dev/null 2>&1
}

# Apply changes on code/src/vs/platform/remote/browser/browserSocketFactory.ts file
apply_code_vs_platform_remote_browser_factory_changes() {
  
  echo "  ⚙️ reworking code/src/vs/platform/remote/browser/browserSocketFactory.ts..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/platform/remote/browser/browserSocketFactory.ts > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/platform/remote/browser/browserSocketFactory.ts
  
  # resolve the change
  git add code/src/vs/platform/remote/browser/browserSocketFactory.ts > /dev/null 2>&1
}

# Apply changes on code/src/server-main.js file
apply_code_server-main_changes() {
  
  echo "  ⚙️ reworking code/src/server-main.js..."
  # reset the file from what is upstream
  git checkout --theirs code/src/server-main.js > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/server-main.js
  
  # resolve the change
  git add code/src/server-main.js > /dev/null 2>&1
}

# Apply changes on code/src/vs/server/node/remoteExtensionHostAgentServer.ts file
apply_code_vs_server_node_remoteExtensionHostAgentServer_changes() {
  
  echo "  ⚙️ reworking code/src/vs/server/node/remoteExtensionHostAgentServer.ts..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/server/node/remoteExtensionHostAgentServer.ts > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/server/node/remoteExtensionHostAgentServer.ts
  
  # resolve the change
  git add code/src/vs/server/node/remoteExtensionHostAgentServer.ts > /dev/null 2>&1
}

# Apply changes on code/src/vs/server/node/webClientServer.ts file
apply_code_vs_server_web_client_server_changes() {
  
  echo "  ⚙️ reworking code/src/vs/server/node/webClientServer.ts..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/server/node/webClientServer.ts > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/server/node/webClientServer.ts
  
  # resolve the change
  git add code/src/vs/server/node/webClientServer.ts > /dev/null 2>&1
}

# Apply changes on code/src/vs/workbench/contrib/remote/browser/remote.ts file
apply_code_vs_workbench_contrib_remote_browser_remote_changes() {
  
  echo "  ⚙️ reworking code/src/vs/workbench/contrib/remote/browser/remote.ts..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/workbench/contrib/remote/browser/remote.ts > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/workbench/contrib/remote/browser/remote.ts
  
  # resolve the change
  git add code/src/vs/workbench/contrib/remote/browser/remote.ts > /dev/null 2>&1
}

# Apply changes on code/src/vs/workbench/contrib/webview/browser/pre/index.html file
apply_code_vs_workbench_contrib_webview_browser_pre_index_html_changes() {
  
  echo "  ⚙️ reworking code/src/vs/workbench/contrib/webview/browser/pre/index.html..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/workbench/contrib/webview/browser/pre/index.html > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/workbench/contrib/webview/browser/pre/index.html
  
  # resolve the change
  git add code/src/vs/workbench/contrib/webview/browser/pre/index.html > /dev/null 2>&1
}

# Apply changes on code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html file
apply_code_vs_workbench_contrib_webview_browser_pre_index_no_csp_html_changes() {
  
  echo "  ⚙️ reworking code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html..."
  # reset the file from what is upstream
  git checkout --theirs code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html
  
  # resolve the change
  git add code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html > /dev/null 2>&1
}

# Apply changes for the given file
apply_changes() {
  local filePath="$1"
  
  if [ -z "$filePath" ]; then
     echo "Can not apply changes - the path was not passed"
     exit 1;
  fi
  
  echo "  ⚙️ reworking $filePath..."
  # reset the file from what is upstream
  git checkout --theirs "$filePath" > /dev/null 2>&1
  
  # now apply again the changes
  apply_replace "$filePath"
  
  # resolve the change
  git add "$filePath" > /dev/null 2>&1
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
    elif [[ "$conflictingFile" == "code/build/lib/mangle/index.js" ]]; then
      apply_mangle_index_js_changes
    elif [[ "$conflictingFile" == "code/build/lib/mangle/index.ts" ]]; then
      apply_mangle_index_ts_changes
    elif [[ "$conflictingFile" == "code/remote/package.json" ]]; then
      apply_code_remote_package_changes
    elif [[ "$conflictingFile" == "code/remote/yarn.lock" ]]; then
      apply_code_remote_yarn_lock_changes      
    elif [[ "$conflictingFile" == "code/src/vs/platform/remote/browser/browserSocketFactory.ts" ]]; then
      apply_code_vs_platform_remote_browser_factory_changes
    elif [[ "$conflictingFile" == "code/src/vs/server/node/webClientServer.ts" ]]; then
      apply_code_vs_server_web_client_server_changes
    elif [[ "$conflictingFile" == "code/src/server-main.js" ]]; then
      apply_code_server-main_changes
    elif [[ "$conflictingFile" == "code/src/vs/server/node/remoteExtensionHostAgentServer.ts" ]]; then
      apply_code_vs_server_node_remoteExtensionHostAgentServer_changes
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/remote/browser/remote.ts" ]]; then
      apply_code_vs_workbench_contrib_remote_browser_remote_changes
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/webview/browser/pre/index.html" ]]; then
      apply_code_vs_workbench_contrib_webview_browser_pre_index_html_changes
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/webview/browser/pre/index-no-csp.html" ]]; then
      apply_code_vs_workbench_contrib_webview_browser_pre_index_no_csp_html_changes
    elif [[ "$conflictingFile" == "code/src/vs/base/common/product.ts" ]]; then
      apply_changes "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts" ]]; then
      apply_changes "$conflictingFile"
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

# make sed -i portable
sed_in_place() {
    SHORT_UNAME=$(uname -s)
  if [ "$(uname)" == "Darwin" ]; then
    sed -i '' "$@"
  elif [ "${SHORT_UNAME:0:5}" == "Linux" ]; then
    sed -i "$@"
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
