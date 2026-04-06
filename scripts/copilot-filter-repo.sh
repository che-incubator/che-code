#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
	echo "Usage: $0 <branch-name>"
	exit 1
fi

BRANCH="$1"
TMPDIR_REPO=$(mktemp -d)

echo "Cloning into $TMPDIR_REPO..."
git clone --branch "$BRANCH" --single-branch https://github.com/microsoft/vscode-copilot-chat.git "$TMPDIR_REPO"

pushd "$TMPDIR_REPO"
echo "Running git filter-repo..."
git filter-repo --to-subdirectory-filter extensions/copilot

echo "Pushing to joaomoreno/vscode-copilot-chat.git..."
git remote add target https://github.com/joaomoreno/vscode-copilot-chat.git
git push target "$BRANCH" --force
popd

echo "Cleaning up..."
rm -rf "$TMPDIR_REPO"

echo "Done."
