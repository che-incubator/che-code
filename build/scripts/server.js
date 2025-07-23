/*
 Copyright (c) 2025 Red Hat, Inc.
 This program and the accompanying materials are made
 available under the terms of the Eclipse Public License 2.0
 which is available at https://www.eclipse.org/legal/epl-2.0/

 SPDX-License-Identifier: EPL-2.0
*/

const http = require('http');
const fs = require('fs');
const hostname = '127.0.0.1';
const port = 3400;

const server = http.createServer((req, res) => {
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
      genKey = fs.readFileSync('/opt/ssh/ssh_client_ed25519_key', 'utf8');
    } catch (err) {
     // continue
    }

  let keyMessage = `
        <pre>${hasUserPrefSSHKey ? pubKey : genKey}</pre>
        </p>
        <p>
        This can also be configured locally in <code>$HOME/.ssh/config</code> with the following :`;

    res.end(`
<!DOCTYPE html>
<html>
  <head>
    <title>${process.env["DEVWORKSPACE_NAME"]}</title>
  </head>
  <body>
    <h1>Workspace ${process.env["DEVWORKSPACE_NAME"]} is running</h1>
    <div class="border">
      <ol>
        <li>Make sure your local oc client is logged in to your OpenShift cluster</li>
        <li><p class="center">Run <code>oc port-forward ${process.env["HOSTNAME"]} 2022:2022</code>. This establishes a connection to the workspace.</p></li>
        <li>
        <p>In your local VS Code, connect to <code>localhost</code> on port <code>2022</code> with user <code>${process.env["USER_NAME"]}</code> ${hasUserPrefSSHKey ? `. The SSH key, corresponding to the following public key, configured in the "SSH Keys" tab of "User Preferences" has been authorized to connect :` : `and the following identity file :`} ${keyMessage}
        <pre>
Host localhost
  HostName 127.0.0.1
  User ${process.env["USER_NAME"]}
  Port 2022
  IdentityFile /path/to/the/ssh_client_ed25519_key
        </pre>
        </p>
        </li>
      </ol>
      <p>If the connection fails with "<code>WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED</code>", it may be necessary to remove the <code>localhost</code> or <code>127.0.0.1</code> entries from <code>$HOME/.ssh/known_hosts</code>. This is because the SSHD service container (to which <code>oc port-forward</code> is forwarding) may change.</p>
    </div>
  </body>
</html>
    `);
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
