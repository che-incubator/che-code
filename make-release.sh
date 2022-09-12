#!/bin/bash
#
# Copyright (c) 2020-2021 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

# Release process automation script.
# Used to create branch/tag, update VERSION files
# and and trigger release by force pushing changes to the release branch

# set to 1 to actually tag the changes to the release branch
TAG_RELEASE=0
NOCOMMIT=0
NEXT_TAG_NAME="next"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    '-t'|'--tag-release') TAG_RELEASE=1; NOCOMMIT=0; shift 0;;
    '-v'|'--version') VERSION="$2"; shift 1;;
    '-n'|'--no-commit') NOCOMMIT=1; TAG_RELEASE=0; shift 0;;
  esac
  shift 1
done

sed_in_place() {
    SHORT_UNAME=$(uname -s)
  if [ "$(uname)" == "Darwin" ]; then
    sed -i '' "$@"
  elif [ "${SHORT_UNAME:0:5}" == "Linux" ]; then
    sed -i "$@"
  fi
}


bump_version () {
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  NEXT_VERSION=$1
  BUMP_BRANCH=$2

  git checkout "${BUMP_BRANCH}"

  echo "Updating project version to ${NEXT_VERSION}"
  npm --no-git-tag-version version --allow-same-version $NEXT_VERSION

  if [[ ${NOCOMMIT} -eq 0 ]]; then
    COMMIT_MSG="chore: Bump to ${NEXT_VERSION} in ${BUMP_BRANCH}"
    git commit -asm "${COMMIT_MSG}"
    git pull origin "${BUMP_BRANCH}"

    set +e
    PUSH_TRY="$(git push origin "${BUMP_BRANCH}")"
    # shellcheck disable=SC2181
    if [[ $? -gt 0 ]] || [[ $PUSH_TRY == *"protected branch hook declined"* ]]; then
        # create pull request for main branch, as branch is restricted
        PR_BRANCH=pr-${BUMP_BRANCH}-to-${NEXT_VERSION}
        git branch "${PR_BRANCH}"
        git checkout "${PR_BRANCH}"
        git pull origin "${PR_BRANCH}"
        git push origin "${PR_BRANCH}"
        lastCommitComment="$(git log -1 --pretty=%B)"
        hub pull-request -f -m "${lastCommitComment}" -b "${BUMP_BRANCH}" -h "${PR_BRANCH}"
    fi
    set -e
  fi
  git checkout "${CURRENT_BRANCH}"
}

usage ()
{
  echo "Usage: $0 --version [VERSION TO RELEASE] [--tag-release]"
  echo "Example: $0 --version 7.7.0 --tag-release"; echo
}

if [[ ! ${VERSION} ]]; then
  usage
  exit 1
fi

# derive branch from version
BRANCH=${VERSION%.*}.x

# if doing a .0 release, use main; if doing a .z release, use $BRANCH
if [[ ${VERSION} == *".0" ]]; then
  BASEBRANCH="main"
else
  BASEBRANCH="${BRANCH}"
fi

# get sources from ${BASEBRANCH} branch
git fetch origin "${BASEBRANCH}":"${BASEBRANCH}"
git checkout "${BASEBRANCH}"

# create new branch off ${BASEBRANCH} (or check out latest commits if branch already exists), then push to origin
if [[ "${BASEBRANCH}" != "${BRANCH}" ]]; then
  git branch "${BRANCH}" || git checkout "${BRANCH}" && git pull origin "${BRANCH}"
  git push origin "${BRANCH}"
  git fetch origin "${BRANCH}:${BRANCH}"
  git checkout "${BRANCH}"
fi

set -e

npm --no-git-tag-version version --allow-same-version "${VER}"

# commit change into branch
if [[ ${NOCOMMIT} -eq 0 ]]; then
  COMMIT_MSG="chore: Bump to ${VERSION} in ${BRANCH}"
  git commit -asm "${COMMIT_MSG}"
  git pull origin "${BRANCH}"
  git push origin "${BRANCH}"
fi

if [[ $TAG_RELEASE -eq 1 ]]; then
  # tag the release
  git checkout "${BRANCH}"
  git tag "${VERSION}"
  git push origin "${VERSION}"
fi
