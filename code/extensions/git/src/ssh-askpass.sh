#!/bin/sh
if [ -f /etc/ssh/passphrase ] && command -v ssh-keygen >/dev/null; then
  if ssh-keygen -y -P "$(cat /etc/ssh/passphrase)" -f /etc/ssh/dwo_ssh_key >/dev/null; then
    cat /etc/ssh/passphrase
    exit 0
  fi
fi
VSCODE_GIT_ASKPASS_PIPE=`mktemp`
ELECTRON_RUN_AS_NODE="1" VSCODE_GIT_ASKPASS_PIPE="$VSCODE_GIT_ASKPASS_PIPE" VSCODE_GIT_ASKPASS_TYPE="ssh" "$VSCODE_GIT_ASKPASS_NODE" "$VSCODE_GIT_ASKPASS_MAIN" $VSCODE_GIT_ASKPASS_EXTRA_ARGS $*
cat $VSCODE_GIT_ASKPASS_PIPE
rm $VSCODE_GIT_ASKPASS_PIPE
