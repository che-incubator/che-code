/*
 Copyright (c) 2025 Red Hat, Inc.
 This program and the accompanying materials are made
 available under the terms of the Eclipse Public License 2.0
 which is available at https://www.eclipse.org/legal/epl-2.0/

 SPDX-License-Identifier: EPL-2.0
*/

const http = require('http');
const fs = require('fs');
const os = require('os');

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
        <pre>${hasUserPrefSSHKey ? pubKey : genKey}</pre>`;

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
        <li><p class="center">Run <code><b>oc port-forward ${process.env["HOSTNAME"]} 2022:2022</b></code>. This establishes a connection to the workspace.</p></li>
        <li>
        <p>In your local VS Code, connect to <code>localhost</code> on port <code>2022</code> with user <code>${os.userInfo().username}</code> ${hasUserPrefSSHKey ? `. The SSH key, corresponding to the following public key, configured in the "SSH Keys" tab of "User Preferences" has been authorized to connect :` : `and the following identity file :`} ${keyMessage}</p>
        <p>
        This can also be configured locally in <code>$HOME/.ssh/config</code> with the following :
        <pre><b>
Host localhost
  HostName 127.0.0.1
  User ${os.userInfo().username}
  Port 2022
  IdentityFile /path/to/the/ssh_client_ed25519_key
  UserKnownHostsFile /dev/null
        </b></pre>
        </p>
        </li>
      </ol>
      <h3>Troubleshooting</h3>
      <p>If the connection fails with "<code>WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED</code>", it may be necessary to remove the <code>localhost</code> or <code>127.0.0.1</code> entries from <code>$HOME/.ssh/known_hosts</code>. This is because the SSHD service container (to which <code>oc port-forward</code> is forwarding) may change. This can be bypassed by setting <code>UserKnownHostsFile /dev/null</code></p>
      <p>Please ensure the permissions on the private key used are restricted to allow only the file owner to read/write. The SSH service may fail to correctly authenticate otherwise.</p>
      <p>The most common setup is to connect to the workspace using the "Remote - SSH Connection" from the corresponding editor's extension marketplace. If this setup fails to connect to the workspace, consider disabling the setting <code><b>remote.SSH.useExecServer</b></code> (set to false)</p>
      <p>For any other issues, relating to the use of a VS Code-based editor and the "Remote - SSH connection", the "Remote - SSH" logs from the "Output" view are very helpful in diagnosing the issue.</p>
    </div>
  </body>
</html>
    `);
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
