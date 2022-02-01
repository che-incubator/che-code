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
#

if ! whoami &> /dev/null; then
  if [ -w /etc/passwd ]; then
    echo "${USER_NAME:-che}:x:$(id -u):0:Eclipse Che:${HOME}:/bin/zsh" >> /etc/passwd
    echo "${USER_NAME:-che}:x:$(id -u):" >> /etc/group
  fi
fi


tail -f /dev/null
