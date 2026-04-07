#!/bin/bash
set -euo pipefail

TMPDIR_REPO=$(mktemp -d)

echo "Cloning into $TMPDIR_REPO..."
git clone --no-single-branch https://github.com/microsoft/vscode-copilot-chat.git "$TMPDIR_REPO"

pushd "$TMPDIR_REPO"
echo "Fetching all LFS objects..."
git lfs fetch --all
echo "Running git filter-repo..."
git filter-repo --to-subdirectory-filter extensions/copilot

echo "Pushing all branches and tags to joaomoreno/vscode-copilot-chat.git..."
git remote add target https://github.com/joaomoreno/vscode-copilot-chat.git
git push target --all
git push target --tags
popd

echo "Cleaning up..."
rm -rf "$TMPDIR_REPO"

echo "Done."
