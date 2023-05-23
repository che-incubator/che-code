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

RESOURCES_DIR_NAME='resources'
NAMESPACED_DIR_NAME='namespaced'
CLUSTER_DIR_NAME='cluster'

collectLogs() {
  mkdir -p ${ARTIFACTS_DIR}

  set +ex
  # Collect logs only for k8s cluster since OpenShift CI already dump all resources
  collectClusterResources

  # additionally grab server logs for fast access
  chectl server:logs -n $NAMESPACE -d $ARTIFACTS_DIR
  set -e
}

collectClusterResources() {
  allNamespaces=$(kubectl get namespaces -o custom-columns=":metadata.name")
  for namespace in $allNamespaces ; do
    collectNamespacedScopeResources $namespace
    collectNamespacedPodLogs $namespace
    collectNamespacedEvents $namespace
  done
  collectClusterScopeResources
}

collectNamespacedScopeResources() {
  namespace="$1"
  if [[ -z $namespace ]]; then return; fi

  STANDARD_KINDS=(
                  "pods"
                  "jobs"
                  "deployments"
                  "services"
                  "ingresses"
                  "configmaps"
                  "secrets"
                  "serviceaccounts"
                  "roles"
                  "rolebindings"
                  "pvc"
                  )
  CRDS_KINDS=($(kubectl get crds -o jsonpath="{.items[*].spec.names.plural}"))
  KINDS=("${STANDARD_KINDS[@]}" "${CRDS_KINDS[@]}")

  for kind in "${KINDS[@]}" ; do
    dir="${ARTIFACTS_DIR}/${RESOURCES_DIR_NAME}/${NAMESPACED_DIR_NAME}/${namespace}/${kind}"
    mkdir -p $dir

    names=$(kubectl get -n $namespace $kind --no-headers=true -o custom-columns=":metadata.name")
    for name in $names ; do
      filename=${name//[:<>|*?]/_}
      kubectl get -n $namespace $kind $name -o yaml > "${dir}/${filename}.yaml"
    done
  done
}

collectNamespacedPodLogs() {
  namespace="$1"
  if [[ -z $namespace ]]; then return; fi

  dir="${ARTIFACTS_DIR}/${RESOURCES_DIR_NAME}/${NAMESPACED_DIR_NAME}/${namespace}/logs"
  mkdir -p $dir

  pods=$(kubectl get -n $namespace pods --no-headers=true -o custom-columns=":metadata.name")
  for pod in $pods ; do
    containers=$(kubectl get -n $namespace pod $pod -o jsonpath="{.spec.containers[*].name}")
    for container in $containers ; do
      filename=${pod//[:<>|*?]/_}_${container//[:<>|*?]/_}
      kubectl logs -n $namespace $pod -c $container > "${dir}/${filename}.log"
    done
  done
}

collectNamespacedEvents() {
  namespace="$1"
  if [[ -z $namespace ]]; then return; fi

  dir="${ARTIFACTS_DIR}/${RESOURCES_DIR_NAME}/${NAMESPACED_DIR_NAME}/${namespace}"
  mkdir -p $dir

  kubectl get -n $namespace events > "${dir}/events.yaml"
}

collectClusterScopeResources() {
  KINDS=(
        "crds"
        "pv"
        "clusterroles"
        "clusterrolebindings"
        )
  for kind in "${KINDS[@]}" ; do
    dir="${ARTIFACTS_DIR}/${RESOURCES_DIR_NAME}/${CLUSTER_DIR_NAME}/${kind}"
    mkdir -p $dir

    names=$(kubectl get -n $namespace $kind --no-headers=true -o custom-columns=":metadata.name")
    for name in $names ; do
      filename=${name//[:<>|*?]/_}
      kubectl get -n $namespace $kind $name -o yaml > "${dir}/${filename}.yaml"
    done
  done
}
