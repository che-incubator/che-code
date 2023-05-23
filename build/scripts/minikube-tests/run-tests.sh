#!/bin/sh
#
# Copyright (c) 2023 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

set -e
set -x

# Stop execution on any error
trap "catchFinish" EXIT SIGINT

echo "Running Smoke Tests..."

# Get absolute path for root repo directory from github actions context: https://docs.github.com/en/free-pro-team@latest/actions/reference/context-and-expression-syntax-for-github-actions
export OPERATOR_REPO="${GITHUB_WORKSPACE}"
if [ -z "${OPERATOR_REPO}" ]; then
  OPERATOR_REPO=$(dirname "$(dirname "$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")")")
fi

source "${OPERATOR_REPO}/build/scripts/minikube-tests/common.sh"

catchFinish() {
  result=$?

  collectLogs
  if [ "$result" != "0" ]; then
    echo "[ERROR] Job failed."
  else
    echo "[INFO] Job completed successfully."
  fi

  rm -rf ${OPERATOR_REPO}/tmp

  echo "[INFO] Please check github actions artifacts."
  exit $result
}

initDefaults() {
  echo "> initDefaults"
  export NAMESPACE="eclipse-che"
  export ARTIFACTS_DIR=${ARTIFACT_DIR:-"/tmp/artifacts-che"}
  export CHECTL_TEMPLATES_BASE_DIR=/tmp/chectl-templates
  export OPERATOR_IMAGE="test/che-operator:test"
  export DEV_WORKSPACE_NAME="test-dev-workspace"
  export USER_NAMESPACE="admin-che"

  # turn off telemetry
  mkdir -p ${HOME}/.config/chectl
  echo "{\"segment.telemetry\":\"off\"}" > ${HOME}/.config/chectl/config.json

  getLatestStableVersions
}

getLatestStableVersions() {
  echo "> getLatestStableVersions"
  git remote add operator https://github.com/eclipse-che/che-operator.git
  git fetch operator -q
  tags=$(git ls-remote --refs --tags operator | sed -n 's|.*refs/tags/\(7.*\)|\1|p' | awk -F. '{ print ($1*1000)+($2*10)+$3" "$1"."$2"."$3}' | sort | tac)
  export PREVIOUS_PACKAGE_VERSION=$(echo "${tags}" | sed -n 2p | cut -d ' ' -f2)
  export LAST_PACKAGE_VERSION=$(echo "${tags}" | sed -n 1p | cut -d ' ' -f2)
  git remote remove operator
}

createDevWorkspace() {
  kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${USER_NAMESPACE}
  annotations:
    che.eclipse.org/username: admin
  labels:
    app.kubernetes.io/component: workspaces-namespace
    app.kubernetes.io/part-of: che.eclipse.org
    kubernetes.io/metadata.name: ${USER_NAMESPACE}
EOF

  kubectl apply -f - <<EOF
kind: DevWorkspace
apiVersion: workspace.devfile.io/v1alpha2
metadata:
  name: ${DEV_WORKSPACE_NAME}
  namespace: ${USER_NAMESPACE}
spec:
  routingClass: che
  started: false
  contributions:
    - name: ide
      uri: http://plugin-registry.eclipse-che.svc:8080/v3/plugins/che-incubator/che-code/insiders/devfile.yaml
  template:
    components:
      - name: tooling-container
        container:
          image: quay.io/devfile/universal-developer-image:ubi8-latest
          cpuLimit: 100m
EOF
}

startAndWaitDevWorkspace() {
  # pre-pull image for faster workspace startup
  minikube image pull quay.io/devfile/universal-developer-image:ubi8-latest

  kubectl patch devworkspace ${DEV_WORKSPACE_NAME} -p '{"spec":{"started":true}}' --type=merge -n ${USER_NAMESPACE}
  kubectl wait devworkspace ${DEV_WORKSPACE_NAME} -n ${USER_NAMESPACE} --for=jsonpath='{.status.phase}'=Running --timeout=300s
}

stopAndWaitDevWorkspace() {
  kubectl patch devworkspace ${DEV_WORKSPACE_NAME} -p '{"spec":{"started":false}}' --type=merge -n ${USER_NAMESPACE}
  kubectl wait devworkspace ${DEV_WORKSPACE_NAME} -n ${USER_NAMESPACE} --for=jsonpath='{.status.phase}'=Stopped
}

deleteDevWorkspace() {
  kubectl delete devworkspace ${DEV_WORKSPACE_NAME} -n ${USER_NAMESPACE}
}

runTest() {
  echo "> runTest"
  # buildAndCopyCheOperatorImageToMinikube
  # yq -riSY '.spec.template.spec.containers[0].image = "'${OPERATOR_IMAGE}'"' "${CURRENT_OPERATOR_VERSION_TEMPLATE_PATH}/che-operator/kubernetes/operator.yaml"
  # yq -riSY '.spec.template.spec.containers[0].imagePullPolicy = "IfNotPresent"' "${CURRENT_OPERATOR_VERSION_TEMPLATE_PATH}/che-operator/kubernetes/operator.yaml"

  # chectl server:deploy \
  #   --batch \
  #   --platform minikube \
  #   --k8spodwaittimeout=120000 \
  #   --k8spodreadytimeout=120000 \
  #   --templates "${CURRENT_OPERATOR_VERSION_TEMPLATE_PATH}" \
  #   --k8spodwaittimeout=120000 \
  #   --k8spodreadytimeout=120000 \
  #   --che-operator-cr-patch-yaml "${OPERATOR_REPO}/build/scripts/minikube-tests/minikube-checluster-patch.yaml"

  # make wait-devworkspace-running NAMESPACE="devworkspace-controller" VERBOSE=1

  chectl server:deploy \
    --batch \
    --platform minikube \
    --k8spodwaittimeout=120000 \
    --k8spodreadytimeout=120000 \
    --che-operator-cr-patch-yaml "${OPERATOR_REPO}/build/scripts/minikube-tests/minikube-checluster-patch.yaml"

  createDevWorkspace
  startAndWaitDevWorkspace

  sleep 2m

  stopAndWaitDevWorkspace
  deleteDevWorkspace
}

pushd ${OPERATOR_REPO} >/dev/null
initDefaults
# initTemplates
runTest
popd >/dev/null

echo "================================================================================"
echo "=                                     DONE                                     ="
echo "================================================================================"
