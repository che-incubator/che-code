Contribute to VS Code Devfile extension
================

### Step 1 : Open this repository in an Eclipse Che cloud development environment

Use this GitHub repository URL in Eclipse Che Dashboard or in a direct link `https://<che-hostname>/#https://github.com/devfile/vscode-walkthrough-extension/`.

Click on the link below to open it in Red Hat Developer Sandbox:

[![Contribute](https://img.shields.io/static/v1?label=Open%20in%20Red%20Hat%20Developer%20Sandbox...&message=Free%20as%20free%20🍺%20and%20free%20💬..&logo=eclipseche&color=FDB940&labelColor=525C86)](https://workspaces.openshift.com#https://github.com/devfile/vscode-walkthrough-extension/)

### Step 2 : Compile extension

The first you need to install node dependencies by running the task `devfile: Install dependencies`.
The task progress will be shown in VS Code Terminal output.

Once dependencies have been installed, compile the extension with task `devfile: Compile`.
It will create an `out` directory containing the compiled extension.

### Step 3 : Run the extension in separte VS Code instance

Now you can test the extension in a separate VS Code instance.

> Note that it is not possible to launch the extension until you compile it as described in step 2.

To run a separate VS Code instance focus the editor or the `Explorer`, press `F5`. After a few seconds VS Code starts a separate instance in a new browser tab.

In the new VS Code instance a `Welcome` tab is opened with a link to the `Get Started with Devfile` VS Code Walkthrough.
If the VS Code Walkthrough link is not there try expanding the Walkthroughs by clicking `More...` on the right.

### Step 4 : Build `vsix` binary

Run task `devfile: Build vsix binary` to build the extension binary.

In a terminal you may be warned with a message below:

>  **WARNING**  Using '*' activation is usually a bad idea as it impacts performance.

Just type `y` to the terminal and press `Enter` to confirm the build.

When build finished, a new file `devfile-vscode-devfile-0.0.1.vsix` will appear in the project root.

The file can be downloaded and used in other local or remote VS Code instances.

> Installing a vsix binary in VS Code is easy: drag and drop the file into the `Extensions` view.
