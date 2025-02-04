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

# All the extensions in Visual Studio Code have `commonjs` type.
# Some extensions depend on `@devfile/api` package, which is build as a `module`.
#
# There is a restriction, that it is not possible to use 'import'
# when referencing `module` libraries from `commonjs` code.
#
# This script will recompile `node_modules/@devfile/api` dependency for specified extensions
# to have the dependency with type `commonjs` instead of `module`.

set -e
set -u

recompile_devfile_api() {
  local devfile_api_path="code/extensions/${1}/node_modules/@devfile/api"
  echo "Recompile ${devfile_api_path}"

  # remember current directory
  local cur_dir=$(pwd)

  # go to dependency directory
  cd $devfile_api_path

  # delete target dist directory, a new one will be created
  rm -rf dist

  #
  # patch package.json
  #

  # remove `main`, `type`, `module`, `exports`, `typings` properties
  echo "$(jq 'del(.main)' package.json)" > package.json
  echo "$(jq 'del(.type)' package.json)" > package.json
  echo "$(jq 'del(.module)' package.json)" > package.json
  echo "$(jq 'del(.exports)' package.json)" > package.json
  echo "$(jq 'del(.typings)' package.json)" > package.json

  # add new `main` and `types` properties with new values
  echo "$(jq '. += {"main": "dist/index.js"}' package.json)" > package.json
  echo "$(jq '. += {"types": "dist/index.d.ts"}' package.json)" > package.json

  #
  # patch tsconfig.json
  #

  # remove comments
  cp -f tsconfig.json tsconfig.json.copy
  node -p 'JSON.stringify(eval(`(${require("fs").readFileSync("tsconfig.json.copy", "utf-8").toString()})`))' | jq > tsconfig.json

  # remove unwanted properties
  echo "$(jq 'del(.compilerOptions.noUnusedLocals)' tsconfig.json)" > tsconfig.json
  echo "$(jq 'del(.compilerOptions.noUnusedParameters)' tsconfig.json)" > tsconfig.json
  echo "$(jq 'del(.compilerOptions.noImplicitReturns)' tsconfig.json)" > tsconfig.json
  echo "$(jq 'del(.compilerOptions.noFallthroughCasesInSwitch)' tsconfig.json)" > tsconfig.json

  # add module type
  echo "$(jq '.compilerOptions += {"module": "commonjs"}' tsconfig.json)" > tsconfig.json
  # add skipLibCheck
  echo "$(jq '.compilerOptions += {"skipLibCheck": true}' tsconfig.json)" > tsconfig.json

  # recompile the library
  npm run build

  # return back to the root directory
  cd $cur_dir
}

extensions=("che-api" "che-commands" "che-github-authentication" "che-port" "che-remote")
for extension in ${extensions[@]}; do
  recompile_devfile_api "${extension}"
done
