/*
 Copyright (c) 2025 Red Hat, Inc.
 This program and the accompanying materials are made
 available under the terms of the Eclipse Public License 2.0
 which is available at https://www.eclipse.org/legal/epl-2.0/

 SPDX-License-Identifier: EPL-2.0
*/

function copyToClipboard(id) {
  var copyText = document.getElementById(id);
  navigator.clipboard.writeText(copyText.innerHTML);
}

function initializePlatformContent() {

  if (navigator.userAgent.indexOf('Windows') !== -1) {
    var pathEntries = document.getElementsByClassName('path');
    for (var i = 0; i < pathEntries.length; i++) {
      var currText = pathEntries[i].innerHTML;
      currText = currText.replaceAll("/dev/null", "nul");
      currText = currText.replaceAll("$HOME", "%USERPROFILE%");
      currText = currText.replaceAll("/","\\");
      pathEntries[i].innerHTML = currText;
    }
  }
}
