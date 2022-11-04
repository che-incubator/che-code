#!/bin/bash
#
# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

set -e

JSON_INDENT="--tab"

BRANDING_DIR=$(cd "$(dirname "$0")"; pwd)
CODE_DIR="$BRANDING_DIR/../code"
PRODUCT_JSON_BRANDING="$BRANDING_DIR/product.json"

PRODUCT_JSON_ORIGINAL="$CODE_DIR/product.json"
FAVICON_ORIGINAL="$CODE_DIR/resources/server/favicon.ico"
REMOTE_INDICATOR_JSON_ORIGINAL="$CODE_DIR/extensions/che-remote/package.nls.json"
WELCOME_ICON_ORIGINAL="$CODE_DIR/src/vs/workbench/browser/media/code-icon.svg"
LETTERPRESS_LIGHT_ICON_ORIGINAL="$CODE_DIR/src/vs/workbench/browser/parts/editor/media/letterpress-light.svg"
LETTERPRESS_DARK_ICON_ORIGINAL="$CODE_DIR/src/vs/workbench/browser/parts/editor/media/letterpress-dark.svg"
WORKBENCH_CONFIG_ORIGINAL="$CODE_DIR/src/vs/code/browser/workbench/che/workbench-config.json"
CODICON_DIR_ORIGINAL="$CODE_DIR/src/vs/base/browser/ui/codicons/codicon"
CODICON_CSS_FILE_ORIGINAL="$CODICON_DIR_ORIGINAL/codicon.css"

# keys to icons and other fields in the branding/product.json file
FAVICON_KEY="icons.favicon.universal"
WELCOME_ICON_KEY="icons.welcome.universal"
LETTERPRESS_LIGHT_ICON_KEY="icons.letterpress.light"
LETTERPRESS_DARK_ICON_KEY="icons.letterpress.dark"
STATUSBAR_ITEM_ICON_KEY="icons.statusBarItem.universal"
WORKBENCH_CONFIG_FILE_KEY="workbenchConfigFilePath"
CODICON_CSS_FILE_KEY="codiconCssFilePath"
REMOTE_INDICATOR_COMMANDS_KEY="remoteIndicatorCommands"

log_progress() {
	# allow-any-unicode-next-line
	echo "    ⚙️ ${1}"
}

log_success() {
	echo "      🎉  ${1}"
}

log_warning() {
	echo "      ⚠️  ${1}"
}

log_error() {
	echo "      [ERROR] ${1}"
}

# Apply changes on code/product.json file
apply_code_product_changes() {
	log_progress "Reworking code/product.json..."

	local tmpFile="$PRODUCT_JSON_BRANDING.tmp"
	jq "$JSON_INDENT" -s '.[0] * .[1]' "$PRODUCT_JSON_ORIGINAL" "$PRODUCT_JSON_BRANDING">"$tmpFile"
	mv -f "$tmpFile" "$PRODUCT_JSON_ORIGINAL"

	log_success "Successfully updated: $PRODUCT_JSON_ORIGINAL"
}

# Apply changes on workbench-config.json file
apply_workbench_config_changes() {
	local workbenchConfigFile
	workbenchConfigFile="$(jq --raw-output ".$WORKBENCH_CONFIG_FILE_KEY // empty" "$PRODUCT_JSON_BRANDING")"
	if [[ -z "$workbenchConfigFile" ]]; then
		log_warning "Ignoring branding operation for workbench configuration: product.json doesn't contain $WORKBENCH_CONFIG_FILE_KEY field"
		exit 0
	fi

	local fileName
	fileName=$(basename "$WORKBENCH_CONFIG_ORIGINAL")
	log_progress "Reworking $fileName..."

	local workbenchConfigBranding="$BRANDING_DIR/$workbenchConfigFile"
	if [ ! -f "$workbenchConfigBranding" ]; then
		log_error "Can not apply branding operation, the file does not exist: $workbenchConfigBranding"
		exit 1
	fi

	local tmpFile="$workbenchConfigBranding.tmp"
	jq "$JSON_INDENT" -s '.[0] * .[1]' "$WORKBENCH_CONFIG_ORIGINAL" "$workbenchConfigBranding">"$tmpFile"
	mv -f "$tmpFile" "$WORKBENCH_CONFIG_ORIGINAL"

	log_success "Successfully updated: $WORKBENCH_CONFIG_ORIGINAL"
}

# Apply changes on codicon.css file
apply_codicon_css_file_changes() {
	local codiconCssFile
	codiconCssFile="$(jq --raw-output ".$CODICON_CSS_FILE_KEY // empty" "$PRODUCT_JSON_BRANDING")"
	if [[ -z "$codiconCssFile" ]]; then
		log_warning "Ignoring branding operation for codicon.css: product.json doesn't contain $CODICON_CSS_FILE_KEY field"
		exit 0
	fi

	local fileName
	fileName=$(basename "$CODICON_CSS_FILE_ORIGINAL")
	log_progress "Reworking $fileName..."

	local codiconCssBranding="$BRANDING_DIR/$codiconCssFile"
	if [ ! -f "$codiconCssBranding" ]; then
		log_error "Can not apply branding operation, the file does not exist: $codiconCssBranding"
		exit 1
	fi
	cat "$codiconCssBranding" >> "$CODICON_CSS_FILE_ORIGINAL"

	log_success "Successfully updated: $CODICON_CSS_FILE_ORIGINAL"
}

# Apply changes for remote indicator commands
apply_remote_indicator_commands() {
	local remoteIndicatorCommandsBranding
	remoteIndicatorCommandsBranding="$(jq --raw-output ".$REMOTE_INDICATOR_COMMANDS_KEY // empty" "$PRODUCT_JSON_BRANDING")"
	if [[ -z "$remoteIndicatorCommandsBranding" ]]; then
		log_warning "Ignoring branding operation for remote indicator commands: product.json doesn't contain $REMOTE_INDICATOR_COMMANDS_KEY field"
		exit 0
	fi

	local fileName
	fileName=$(basename "$REMOTE_INDICATOR_JSON_ORIGINAL")
	log_progress "Applying remote indicator commands, reworking $fileName..."

	local tmpFile="tmpFile.tmp"
	local remoteIndicatorCommandsBrandingFile="remoteIndicatorCommands.tmp"

	echo "$remoteIndicatorCommandsBranding">>"$remoteIndicatorCommandsBrandingFile"
	jq "$JSON_INDENT" -s '.[0] * .[1]' "$REMOTE_INDICATOR_JSON_ORIGINAL" "$remoteIndicatorCommandsBrandingFile">"$tmpFile"

	mv -f "$tmpFile" "$REMOTE_INDICATOR_JSON_ORIGINAL"
	rm "$remoteIndicatorCommandsBrandingFile"

	log_success "Successfully updated: $REMOTE_INDICATOR_JSON_ORIGINAL"
}

# $1 - is a key in the branding/product.json file to get the corresponding value, like: .icons.letterpress.light
# $2 - is a path to the original icon which should be replaced by the corresponding one from the branding folder
apply_icon() {
	local iconKey=$1
	local iconOriginalPath=$2

	local icon
	icon=$(jq --raw-output ."$iconKey" "$PRODUCT_JSON_BRANDING")
	local iconPath="$BRANDING_DIR/$icon"

	if [ -f "$iconPath" ]; then
		local iconName
		iconName=$(basename "$iconPath")
		log_progress " applying icon: $iconName..."
		cp -f "$iconPath" "$iconOriginalPath"

		log_success "icon replacement done successfully for $iconOriginalPath"
	else
		log_warning "icon not found by path: $iconPath"
	fi
}

# Apply icons from the branding folder
apply_icons() {
	echo "  Applying icons..."

	apply_icon "$FAVICON_KEY" "$FAVICON_ORIGINAL"
	apply_icon "$WELCOME_ICON_KEY" "$WELCOME_ICON_ORIGINAL"
	apply_icon "$LETTERPRESS_LIGHT_ICON_KEY" "$LETTERPRESS_LIGHT_ICON_ORIGINAL"
	apply_icon "$LETTERPRESS_DARK_ICON_KEY" "$LETTERPRESS_DARK_ICON_ORIGINAL"
	apply_icon "$STATUSBAR_ITEM_ICON_KEY" "$CODICON_DIR_ORIGINAL"

	echo "  🎉 Icons replacement done!"
}

do_branding() {
	echo "Branding operation is using resources from: $BRANDING_DIR"
	if [ ! -f "$PRODUCT_JSON_BRANDING" ]; then
		echo "⚠️ Ignoring branding operation, the file does not exist: $PRODUCT_JSON_BRANDING"
		exit 0
	fi

	apply_code_product_changes
	apply_workbench_config_changes
	apply_codicon_css_file_changes
	apply_remote_indicator_commands

	apply_icons

	echo "🎉 Branding operation done successfully!"
}

do_branding
