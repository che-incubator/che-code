/*
 Copyright (c) 2026 Red Hat, Inc.
 This program and the accompanying materials are made
 available under the terms of the Eclipse Public License 2.0
 which is available at https://www.eclipse.org/legal/epl-2.0/

 SPDX-License-Identifier: EPL-2.0
*/

const http = require('http');
const fs = require('fs');

const hostname = '127.0.0.1';
const port = 3400;

let username = "UNKNOWN";
try {
  username = fs.readFileSync(`/sshd/username`, 'utf8');
} catch (error) {
  // continue
}

const server = http.createServer((req, res) => {
    if (req.url === '/') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');

    let hasUserPrefSSHKey = fs.existsSync('/etc/ssh/dwo_ssh_key.pub');

    let pubKey = "PUBLIC KEY COULD NOT BE DISPLAYED";
    try {
      pubKey = fs.readFileSync('/etc/ssh/dwo_ssh_key.pub', 'utf8');
    } catch (err) {
     // continue
    }

    let genKey = "PRIVATE KEY NOT FOUND";
    try {
      genKey = fs.readFileSync(`/sshd/ssh_client_ed25519_key`, 'utf8');
    } catch (err) {
     // continue
    }

    let keyMessage = hasUserPrefSSHKey ? pubKey : genKey;

    res.end(`
<!DOCTYPE html>
<html>
  <head>
    <title>${process.env["DEVWORKSPACE_NAME"]}</title>
    <link rel="stylesheet" href="page-style.css">
    <script src="page-utils.js"></script>
  </head>
  <body>
  <script>
      (function () {    
          window.onload = function () {
            openToolbox()
          }
      }())

      function openToolbox() {
        const tbxLink = "jetbrains://gateway/com.redhat.devtools.toolbox?dwID=${process.env['DEVWORKSPACE_ID']}&dwName=${process.env['DEVWORKSPACE_NAME']}&username=${username}&key=${encodeURIComponent(keyMessage)}&project=${process.env['PROJECT_SOURCE']}"
        console.log("Opening Toolbox App...");
        window.open(tbxLink, "_self");
      }
    </script>

    <h1>Workspace ${process.env["DEVWORKSPACE_NAME"]} is running</h1>


    <div class="border">
      <h4 class="center">Make sure your local <a href="${process.env["CLUSTER_CONSOLE_URL"]}/command-line-tools" target="_blank">oc client</a> is <a href="https://oauth-openshift${getHostURL()}/oauth/token/request" target="_blank">logged in</a> to your OpenShift cluster</h4>
      <p class="center">Run <code id="port-forward">oc port-forward -n ${process.env["DEVWORKSPACE_NAMESPACE"]} ${process.env["HOSTNAME"]} 2022:2022</code><a href="#"><svg class="clipboard-img-code" onclick="copyToClipboard('port-forward')" title="Copy" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
            <path fill="currentColor" d="M12 0H2C.9 0 0 .9 0 2v10h1V2c0-.6.4-1 1-1h10V0z"></path>
            <path fill="currentColor" d="M18 20H8c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2zM8 7c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1H8z"></path>
          </svg></a>. This establishes a connection to the workspace.</p>
    </div>

    <h4 class="center">Can't open the workspace?</h4>
    <p class="center">If your browser doesn't ask you to open Toolbox, make sure the prerequisites mentioned in <a href="https://docs.redhat.com/en/documentation/red_hat_openshift_dev_spaces/latest/html/user_guide/ides-in-workspaces#toolbox" target="_blank">the documentation</a> are met.</p>

    <!-- Provide an alternative way to open IDE, in case the browser can't show a pop-up -->
    <p class="center"><a href="javascript:;" onclick="openToolbox()"><b>Open the workspace over Toolbox</b></a></p>
    <p class="center"><a href="${process.env["CHE_DASHBOARD_URL"]}" target="_blank">Open Dashboard</a></p>

    <script>initializePlatformContent();</script>
  </body>
</html>
    `);
    } else {
      let loc = req.url.substring(1);
      let isBinaryData = false;
      let content = "";

      res.statusCode = 200;
      if (loc.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css");
      } else if (loc.endsWith(".js")) {
        res.setHeader("Content-Type", "text/javascript");
      } else if (loc.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png");
        isBinaryData = true;
      } else {
        res.setHeader("Content-Type", "text/plain");
      }

      try {
        content = fs.readFileSync(loc, isBinaryData ? null : "utf8");
      } catch (err) {
        // continue
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain");
        content = "Not Found";
      }
      res.end(content);
    }
});

server.listen(port, hostname, () => {
    console.log(`Server is running at http://${hostname}:${port}/`);
});

function getHostURL () {
    const consoleURL = process.env["CLUSTER_CONSOLE_URL"];
    const devspacesURL = process.env["CHE_DASHBOARD_URL"];
    if (consoleURL === undefined || devspacesURL === undefined) {
      return undefined;
    }
    let i = 0;
    while (i < consoleURL.length && i < devspacesURL.length
        && consoleURL.substring(consoleURL.length - 1 - i) === devspacesURL.substring(devspacesURL.length - 1 - i)) {
      i++;
    }
    return consoleURL.substring(consoleURL.length - i);
}
