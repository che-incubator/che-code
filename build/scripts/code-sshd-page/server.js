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
      genKey = fs.readFileSync(`${process.env["HOME"]}/.ssh/ssh_client_ed25519_key`, 'utf8');
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
    <h1>Workspace ${process.env["DEVWORKSPACE_NAME"]} is running</h1>
    <div class="border">
      <ol>
        <li>Make sure your local <a href="${process.env["CLUSTER_CONSOLE_URL"]}/command-line-tools">oc client</a> is <a href="https://oauth-openshift${getHostURL()}/oauth/token/request">logged in</a> to your OpenShift cluster</li>
        <li><p class="center">Run <code id="port-forward">oc port-forward -n ${process.env["DEVWORKSPACE_NAMESPACE"]} ${process.env["HOSTNAME"]} 2022:2022</code><a href="#"><svg class="clipboard-img-code" onclick="copyToClipboard('port-forward')" title="Copy" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
            <path fill="currentColor" d="M12 0H2C.9 0 0 .9 0 2v10h1V2c0-.6.4-1 1-1h10V0z"></path>
            <path fill="currentColor" d="M18 20H8c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2zM8 7c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1H8z"></path>
          </svg></a>. This establishes a connection to the workspace.</p></li>
        <li>
        In your local VS Code instance, with either <a href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh">"Remote - SSH"</a> (for VS Code), or <a href="https://open-vsx.org/extension/jeanp413/open-remote-ssh">"Open Remote - SSH"</a> (for Code-OSS), connect to <code>localhost</code> on port <code>2022</code> with user <code>${os.userInfo().username}</code> ${hasUserPrefSSHKey ? `. The SSH key, corresponding to the following public key, configured in the "SSH Keys" tab of "User Preferences" has been authorized to connect :` : `and the following identity file :`}
        <div class="parent">
        <div>
        <pre id="key">${keyMessage}</pre>
        </div>
        <div class="clipboard">
          <a href="#">
          <svg class="clipboard-img-pre" onclick="copyToClipboard('key')" title="Copy" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
            <path fill="currentColor" d="M12 0H2C.9 0 0 .9 0 2v10h1V2c0-.6.4-1 1-1h10V0z"></path>
            <path fill="currentColor" d="M18 20H8c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2zM8 7c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1H8z"></path>
          </svg>
          </a>
        </div>
        </div>
        <p>
        <b>&#9888; Please ensure the permissions on the private key used are restricted to allow only the file owner to read/write. The SSH service may fail to correctly authenticate otherwise.</b>
        </p>
        This can also be configured locally in the client SSH configuration file (eg. <code class="path">$HOME/.ssh/config</code>) with the following :
        <div class="parent">
        <div>
<pre id="config" class="path">Host localhost
  HostName 127.0.0.1
  User ${os.userInfo().username}
  Port 2022
  IdentityFile $HOME/.ssh/ssh_client_ed25519_key
  UserKnownHostsFile /dev/null</pre>
        </div>
        <div class="clipboard">
          <a href="#">
          <svg class="clipboard-img-pre" onclick="copyToClipboard('config')" title="Copy" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
            <path fill="currentColor" d="M12 0H2C.9 0 0 .9 0 2v10h1V2c0-.6.4-1 1-1h10V0z"></path>
            <path fill="currentColor" d="M18 20H8c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2zM8 7c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1H8z"></path>
          </svg>
          </a>
        </div>
        </div>
        <p>
        Where <code class="path">$HOME/.ssh/ssh_client_ed25519_key</code> should be replaced by the absolute path to the private key file on your local system.
        </p>
        </li>
      </ol>
      <h3>Troubleshooting</h3>
      <p>If the connection fails with "<code>WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED</code>", it may be necessary to remove the <code>localhost</code> or <code>127.0.0.1</code> entries from <code class="path">$HOME/.ssh/known_hosts</code>. This is because the SSHD service container (to which <code>oc port-forward</code> is forwarding) may change. This can be bypassed by setting <code>UserKnownHostsFile <span class="path">/dev/null</span></code></p>
      <p>If the connection fails for an unknown reason, consider disabling the setting <code>remote.SSH.useExecServer</code> (set to false)</p>
      <p>For any other issues, relating to the use of a VS Code-based editor and the "Remote - SSH", the "Remote - SSH" logs from the "Output" view are very helpful in diagnosing the issue.</p>
    </div>
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
    console.log(`Server running at http://${hostname}:${port}/`);
});

function getHostURL () {
    const consoleURL = process.env["CLUSTER_CONSOLE_URL"];
    const devspacesURL = process.env["CHE_DASHBOARD_URL"];
    if (consoleURL === undefined || devspacesURL === undefined) {
      return undefined;
    }
    let i = 0;
    while (i < consoleURL.length || i < devspacesURL.length) {
      if (consoleURL.substring(consoleURL.length - 1 - i) != devspacesURL.substring(devspacesURL.length - 1 - i)) {
        if (i != 0) {
          break;
        }
      }
      i++;
   }
    return consoleURL.substring(consoleURL.length - i);
}
