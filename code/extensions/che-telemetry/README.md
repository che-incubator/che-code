# Eclipse Che Telemetry Extension for Visual Studio Code

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features
This extension detects and sends the following events to a backend telemetry plugin listening on `http://localhost:${DEVWORKSPACE_TELEMETRY_BACKEND_PORT}`.

This extension will activate on Che Code startup.

| Event ID         | Description                                                |
|------------------|------------------------------------------------------------|
| WORKSPACE_OPENED | Sent when the telemetry extension activates                |
| EDITOR_USED      | Sent on the vscode.workspace.onDidChangeTextDocument event |
