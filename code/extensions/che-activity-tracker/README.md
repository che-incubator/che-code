# Eclipse Che Activity Tracker for Visual Studio Code

**Notice:** This extension is bundled with Eclipse Che. It can be disabled but not uninstalled.

## What types of activity are tracked?

This extension tracks the following events provided by the VS Code extension API:

* `vscode.workspace.onDidChangeTextDocument`
* `vscode.window.onDidChangeActiveTextEditor`
* `vscode.window.onDidChangeTextEditorSelection`
* `vscode.window.onDidChangeTextEditorViewColumn`
* `vscode.window.onDidChangeWindowState`
* `vscode.window.onDidChangeTerminalState`
* `vscode.window.onDidChangeActiveTerminal`

## How does this extension use the tracked data?
This extension does not save, collect, or store data. This extension detects and sends activity events to [che-machine-exec](https://github.com/eclipse-che/che-machine-exec) in order to determine and terminate inactive workspaces.
