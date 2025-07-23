const http = require('http');
const fs = require('fs');
const hostname = '127.0.0.1';
const port = 3400;

const server = http.createServer((req, res) => {
    // Set the response header
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html'); // Specify HTML content

    let keyContent = "PRIVATE KEY NOT FOUND";
    try {
      keyContent = fs.readFileSync('/opt/ssh/ssh_client_ed25519_key', 'utf8');
    } catch (err) {
     // continue
    }
    // Send the HTML content
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
        <li><p class="center">Run <code>oc port-forward ${process.env["HOSTNAME"]} 2022:2022</code></p></li>
        <li>
        <p>In VS Code, connect to <code>localhost</code> on port <code>2022</code> with user <code>${process.env["USER_NAME"]}</code> and the following identity file :</p>
        <p>
        <pre>
${keyContent}
        </pre>
        </p>
        <p>
        This can also be configured locally in <code>$HOME/.ssh/config</code> with the following :
        </p>
        <p>
        <pre>
Host localhost
  HostName 127.0.0.1
  User dev
  Port 2022
  IdentityFile /path/to/the/ssh_client_ed25519_key
        </pre>
        </p>
        </li>
      </ol>
    </div>
  </body>
</html>
    `);
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
