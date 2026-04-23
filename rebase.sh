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

PREVIOUS_UPSTREAM_VERSION="release/1.108"
CURRENT_UPSTREAM_VERSION="release/1.116"

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
  rm -f "$filename.tmp"
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

apply_multi_line_replace() {
  local -r filename=$1
  local -r replaceSettings=".rebase/replace/$filename.json"
  
  local -r replaceCommands=$(jq -c '.[]' "${replaceSettings}")
  
  IFS=$'\n'
  local from
  local by
  for replaceCommand in $replaceCommands; do
    # need to replace from by the by
    from=$(jq -n "$replaceCommand" | jq -r '.from')
    by=$(jq -n "$replaceCommand" | jq -r '.by')

    cp "$filename" "$filename.bak"
    REPLACE_FROM="$from" REPLACE_BY="$by" perl -0777 -pe 'BEGIN { $from = $ENV{"REPLACE_FROM"}; $by = $ENV{"REPLACE_BY"}; } s|\Q$from\E|$by|g' "$filename.bak" > "$filename"
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

  # apply the replace
  apply_multi_line_replace code/package.json
  
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
# $2 is an optional formatting option passed to override_json_file (e.g. "tab")
apply_package_changes_by_path() {
  local filePath="$1"
  local formattingOption="${2:-}"

  if [ -z "$filePath" ]; then
     echo "Can not apply changes for package.json file - the path was not passed"
     exit 1;
  fi

  echo "  ⚙️ reworking $filePath..."
  
  # reset the file from what is upstream
  git checkout --theirs $filePath > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file $filePath $formattingOption
  
  # resolve the change
  git add $filePath > /dev/null 2>&1
}

# Generic handler for any package-lock.json conflict.
# Takes upstream lock as base, runs npm install to regenerate.
# Always runs npm install unconditionally -- safe regardless of whether
# the package.json has che modifications or not.
resolve_package_lock() {
  local lockFile="$1"
  local dir
  dir=$(dirname "$lockFile")

  echo "  ⚙️ reworking $lockFile..."
  git checkout --theirs "$lockFile" > /dev/null 2>&1
  npm install --ignore-scripts --prefix "$dir"
  git add "$lockFile" > /dev/null 2>&1
}

# Apply changes on code/product.json file
apply_code_product_changes() {
  
  echo "  ⚙️ reworking code/product.json..."
  # reset the file from what is upstream
  git checkout --theirs code/product.json > /dev/null 2>&1
  
  # now apply again the changes
  override_json_file code/product.json "tab"

  # jq's * operator replaces arrays entirely, so builtInExtensions must be
  # appended separately instead of going through the add rule
  local cheExtensions=".rebase/add/code/product.builtInExtensions.json"
  if [ -f "$cheExtensions" ]; then
    jq --tab --slurpfile ext "$cheExtensions" '.builtInExtensions += $ext[0]' code/product.json > code/product.json.tmp
    cat code/product.json.tmp > code/product.json
    rm code/product.json.tmp
  fi

  # jq's * merge appends new keys at the end; reorder Che-specific keys
  # to their expected positions
  local reorder='
def insert_before(src_key; before_key):
  to_entries |
  (map(select(.key == src_key))[0]) as $src |
  if $src then
    map(select(.key != src_key)) |
    (map(.key) | index(before_key)) as $idx |
    (if $idx then .[:$idx] + [$src] + .[$idx:] else . + [$src] end) |
    from_entries
  else . | from_entries end;
insert_before("linuxIconName"; "darwinBundleIdentifier") |
insert_before("extensionEnabledApiProposals"; "defaultChatAgent") |
insert_before("sendASmile"; "defaultChatAgent") |
insert_before("extensionsGallery"; "defaultChatAgent")
'
  jq --tab "$reorder" code/product.json > code/product.json.tmp
  cat code/product.json.tmp > code/product.json
  rm code/product.json.tmp

  # resolve the change
  git add code/product.json > /dev/null 2>&1
}

# Apply changes on code/extensions/github-authentication/package.json file
apply_github_auth_package_changes() {
  local filePath="code/extensions/github-authentication/package.json"
  echo "  ⚙️ reworking $filePath..."
  git checkout --theirs "$filePath" > /dev/null 2>&1
  override_json_file "$filePath"
  jq --indent 2 'del(.contributes)' "$filePath" > "$filePath.tmp"
  cat "$filePath.tmp" > "$filePath"
  rm "$filePath.tmp"
  git add "$filePath" > /dev/null 2>&1
}

# Apply changes on code/src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts file
apply_code_vs_extensions_contribution_changes() {
  local filePath="code/src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts"

  echo "  ⚙️ reworking $filePath..."
  # reset the file from what is upstream
  git checkout --theirs "$filePath" > /dev/null 2>&1

  # apply replacements from JSON
  apply_multi_line_replace "$filePath"

  # apply multiline perl replacement for CommandPalette when clause
  # sed can't handle this because the same when pattern appears on multiple lines;
  # we use multiline context (id: MenuId.CommandPalette) to target only the right one
  local from=$'\t\t\t\tid: MenuId.CommandPalette,\n\t\t\t\twhen: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)\n\t\t\t}, {'
  local by=$'\t\t\t\tid: MenuId.CommandPalette,\n\t\t\t\twhen: ContextKeyExpr.and(\n\t\t\t\t\tContextKeyExpr.or(ContextKeyExpr.equals(\'extensions.install-from-vsix-enabled\', true),\n\t\t\t\t\t\tContextKeyExpr.equals(\'extensions.install-from-vsix-enabled\', undefined)),\n\t\t\t\t\tContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)\n\t\t\t\t),\n\t\t\t}, {'

  cp "$filePath" "$filePath.bak"
  REPLACE_FROM="$from" REPLACE_BY="$by" perl -0777 -pe 'BEGIN { $from = $ENV{"REPLACE_FROM"}; $by = $ENV{"REPLACE_BY"}; } s|\Q$from\E|$by|g' "$filePath.bak" > "$filePath"
  if diff "$filePath" "$filePath.bak" &> /dev/null; then
    echo "Unable to perform the CommandPalette when clause replace in $filePath"
    echo "Wanted to check ${from}"
    cat "$filePath"
    exit 1
  fi
  rm "$filePath.bak"

  # resolve the change
  git add "$filePath" > /dev/null 2>&1
}

# Apply changes on code/src/vs/workbench/contrib/remote/browser/remote.ts file
apply_code_vs_workbench_contrib_remote_browser_remote_changes() {
  local filePath="code/src/vs/workbench/contrib/remote/browser/remote.ts"

  echo "  ⚙️ reworking $filePath..."
  # reset the file from what is upstream
  git checkout --theirs "$filePath" > /dev/null 2>&1

  # apply replacements from JSON
  apply_multi_line_replace "$filePath"

  # apply multiline perl replacement for super() + cheDisconnectionHandler init
  # sed can't handle this because super() appears in two constructors;
  # we anchor on 'const connection' (the line after the target super()) to target only the right one
  local from=$'super();\n\t\tconst connection'
  local by=$'super();\n\t\tthis.cheDisconnectionHandler = new CheDisconnectionHandler(commandService, dialogService, notificationService, requestService, environmentVariableService, progressService);\n\t\tconst connection'

  cp "$filePath" "$filePath.bak"
  REPLACE_FROM="$from" REPLACE_BY="$by" perl -0777 -pe 'BEGIN { $from = $ENV{"REPLACE_FROM"}; $by = $ENV{"REPLACE_BY"}; } s|\Q$from\E|$by|g' "$filePath.bak" > "$filePath"
  if diff "$filePath" "$filePath.bak" &> /dev/null; then
    echo "Unable to perform the super() cheDisconnectionHandler replace in $filePath"
    echo "Wanted to check ${from}"
    cat "$filePath"
    exit 1
  fi
  rm "$filePath.bak"

  # resolve the change
  git add "$filePath" > /dev/null 2>&1
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

# Apply changes for the given file, using multi line replace
apply_changes_multi_line() {
  local filePath="$1"
  
  if [ -z "$filePath" ]; then
     echo "Can not apply changes - the path was not passed"
     exit 1;
  fi
  
  echo "  ⚙️ reworking $filePath..."
  # reset the file from what is upstream
  git checkout --theirs "$filePath" > /dev/null 2>&1
  
  # now apply again the changes
  apply_multi_line_replace "$filePath"
  
  # resolve the change
  git add "$filePath" > /dev/null 2>&1
}

# Will try to identify the conflicting files and for some of them it's easy to re-apply changes
resolve_conflicts() {
  echo "⚠️  There are conflicting files, trying to solve..."
  local -r conflictingFiles=$(git diff --name-only --diff-filter=U)
  local lockFiles=()

  # iterate on all conflicting files (package-lock.json deferred to second pass)
  IFS=$'\n'
  for conflictingFile in $conflictingFiles; do
    echo " ➡️  Analyzing conflict for $conflictingFile"

    # Defer all package-lock.json to after package.json files are resolved
    if [[ "$conflictingFile" == *package-lock.json ]]; then
      lockFiles+=("$conflictingFile")
      continue
    fi

    if [[ "$conflictingFile" == "code/package.json" ]]; then
      apply_code_package_changes
    elif [[ "$conflictingFile" == "code/build/package.json" ]]; then
      apply_package_changes_by_path "$conflictingFile"
    elif [[ "$conflictingFile" == "code/extensions/package.json" ]]; then
      apply_package_changes_by_path "$conflictingFile"
    elif [[ "$conflictingFile" == "code/remote/package.json" ]]; then
      apply_code_remote_package_changes
    elif [[ "$conflictingFile" == "code/product.json" ]]; then
      apply_code_product_changes
    elif [[ "$conflictingFile" == "code/extensions/microsoft-authentication/package.json" ]]; then
      apply_package_changes_by_path "$conflictingFile"
    elif [[ "$conflictingFile" == "code/extensions/github-authentication/package.json" ]]; then
      apply_github_auth_package_changes
    elif [[ "$conflictingFile" == "code/build/lib/mangle/index.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/remote/browser/browserSocketFactory.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/webClientServer.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/server-main.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/product/common/product.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/remoteExtensionHostAgentServer.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/remote/browser/remote.ts" ]]; then
      apply_code_vs_workbench_contrib_remote_browser_remote_changes
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/webview/browser/pre/index.html" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupController.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/code/browser/workbench/workbench.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/extensions/git/src/ssh-askpass.sh" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/base/common/product.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/browser/web.main.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/serverServices.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/serverEnvironmentService.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/shell/node/shellEnv.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/extensionHostConnection.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/server/node/remoteTerminalChannel.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/code/browser/workbench/workbench.html" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/browser/workbench.contribution.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/browser/parts/titlebar/windowTitle.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/browser/parts/titlebar/commandCenterControl.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts" ]]; then
      apply_code_vs_extensions_contribution_changes
    elif [[ "$conflictingFile" == "code/src/vs/platform/extensionManagement/node/extensionManagementService.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/extensionManagement/common/extensionManagement.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/extensionManagement/common/extensionGalleryService.ts" ]]; then
      apply_changes "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/platform/extensionManagement/common/abstractExtensionManagementService.ts" ]]; then
      apply_changes "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/services/extensions/common/extensionsProposedApi.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/extensions/npm/package.json" ]]; then
      apply_package_changes_by_path "$conflictingFile"
    elif [[ "$conflictingFile" == "code/build/gulpfile.cli.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/build/gulpfile.reh.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/resources/server/bin/helpers/browser-linux.sh" ]]; then
      apply_changes_multi_line "$conflictingFile"
    elif [[ "$conflictingFile" == "code/resources/server/bin/remote-cli/code-linux.sh" ]]; then
      apply_changes_multi_line "$conflictingFile"
    else
      # Smart fallback: check if the file has che-specific changes
      local upstream_path="${conflictingFile#code/}"
      local prev_content
      local our_content
      prev_content=$(git show "upstream-code/${PREVIOUS_UPSTREAM_VERSION}:${upstream_path}" 2>/dev/null || echo "")
      our_content=$(git show "HEAD:${conflictingFile}" 2>/dev/null || echo "")

      if [ "$prev_content" = "$our_content" ]; then
        echo "  ⚙️ No che-specific changes detected, taking upstream version"
        git checkout --theirs "$conflictingFile" > /dev/null 2>&1
        git add "$conflictingFile" > /dev/null 2>&1
      else
        echo "$conflictingFile has che-specific changes but no rebase rule!"
        echo "Run pre-rebase.sh first to identify and fix missing rules."
        exit 1
      fi
    fi
  done

  # Second pass: resolve all package-lock.json files
  # (all package.json files are now resolved, so npm install sees correct dependencies)
  for lockFile in "${lockFiles[@]}"; do
    echo " ➡️  Resolving deferred lock file: $lockFile"
    resolve_package_lock "$lockFile"
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
  # fetch the target upstream branch
  git fetch upstream-code ${CURRENT_UPSTREAM_VERSION}
  # grab current upstream version
  UPSTREAM_VERSION=$(git rev-parse upstream-code/${CURRENT_UPSTREAM_VERSION})
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
