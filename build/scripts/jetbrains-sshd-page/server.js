/*
 Copyright (c) 2026 Red Hat, Inc.
 This program and the accompanying materials are made
 available under the terms of the Eclipse Public License 2.0
 which is available at https://www.eclipse.org/legal/epl-2.0/

 SPDX-License-Identifier: EPL-2.0
*/

const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    if (req.url === '/') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${process.env["DEVWORKSPACE_NAME"]}</title>
    <link rel="stylesheet" href="page-style.css">
  </head>
  <body>
  <script>
      (function () {    
          window.onload = function () {
            openToolbox()
          }
      }())

      function openToolbox() {
        const tbxLink = "jetbrains://gateway/com.redhat.devtools.toolbox?dwID=${process.env['DEVWORKSPACE_ID']}"
        console.log("Opening Toolbox App...");
        window.open(tbxLink, "_self");
      }
    </script>

    <h1>Workspace ${process.env["DEVWORKSPACE_NAME"]} is running</h1>


    <div class="border">
      <h4 class="center">Make sure your local <a href="${process.env["CLUSTER_CONSOLE_URL"]}/command-line-tools" target="_blank">oc client</a> is <a href="https://oauth-openshift${getHostURL()}/oauth/token/request" target="_blank">logged in</a> to your OpenShift cluster</h4>
    </div>

    <h4 class="center">Can't open the workspace?</h4>
    <p class="center">If your browser doesn't ask you to open Toolbox, make sure the prerequisites mentioned in <a href="https://docs.redhat.com/en/documentation/red_hat_openshift_dev_spaces/latest/html/user_guide/assembly_customizing-workspaces_user_guide#proc_connecting-jetbrains-toolbox-to-devspaces_user_guide" target="_blank">the documentation</a> are met.</p>

    <!-- Provide an alternative way to open IDE, in case the browser can't show a pop-up -->
    <p class="center"><a href="javascript:;" onclick="openToolbox()"><b>Open the workspace over Toolbox</b></a></p>
    <p class="center"><a href="${process.env["CHE_DASHBOARD_URL"]}" target="_blank">Open Dashboard</a></p>
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
