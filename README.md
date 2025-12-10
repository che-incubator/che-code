[![Contribute](https://www.eclipse.org/che/contribute.svg)](https://workspaces.openshift.com#https://github.com/che-incubator/che-code)
[![Dev](https://img.shields.io/static/v1?label=Open%20in&message=Che%20dogfooding%20server%20(with%20VS%20Code)&logo=eclipseche&color=FDB940&labelColor=525C86)](https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com#https://github.com/che-incubator/che-code)

# che-code

Deploy `Code-OSS` (https://github.com/microsoft/vscode) on a Kubernetes cluster and connect with your Browser.

This repository is hosting the changes to have the `Code-OSS` running inside a browser and connecting to a remote HTTP(s) server (instead of using desktop mode).

The terminal is aware of the running pod. Then, you can open terminals in every container of the running pod (if the containers have shell access).

Upstream `Code-OSS` is stored using Git [subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge). It means that if you're not interested in updating/rebasing upstream code you don't need to setup anything else unlike git submodules. This repository is self-contained.

## Development pre-requisites
 - NodeJS version used by `Code-OSS` (Exact version can be find inside https://github.com/microsoft/vscode/blob/main/remote/.npmrc with target property)
 - `npm`

## Directories layout

- `code` contains the upstream content (subtree) + changes required to have Code running in a remote server.
- `build/dockerfiles` are for building a container.
- `package.json` holds some top-level scripts that you can find also in the `code` folder.

## Development mode

1. Fetch dependencies with `npm install` command
2. Compile and watch folders: `npm run watch`
3. Run the server (another terminal for example): `npm run server`

## Image build

1. `podman build -f build/dockerfiles/linux-musl.Dockerfile -t linux-musl .`
2. `podman build -f build/dockerfiles/linux-libc-ubi8.Dockerfile -t linux-libc-ubi8 .`
3. `podman build -f build/dockerfiles/linux-libc-ubi9.Dockerfile -t linux-libc-ubi9 .`
4. `podman build -f build/dockerfiles/assembly.Dockerfile -t che-code .`

## Developing with Eclipse Che®

This project includes [Devfile](devfile.yaml) that simplifies developing Che-Code in Eclipse Che.
To test your changes in Eclipse Che run the following VS Code tasks:
1. `prepare` to download all the required dependencies
2. `build` to pre-build and start the watch mode
3. `run` to run the VS Code server
4. Follow the suggested URL to test your changes.

## Updates and branches

This repository has a main branch being rebased on the main remote branch of `Code-OSS`.
Then, for each stable version of `Code-OSS`there is a matching branch.
For example remote `release/1.60` is handled locally as a `1.62.x` branch.

### Pulling/Diff against new Code OSS version - useful commands

Add the `Code-OSS` remote by using for example the following command:

```bash
$ git remote add upstream-code https://github.com/microsoft/vscode
```

#### Pulling changes from upstream https://github.com/microsoft/vscode

For a release branch:

```bash
$ git subtree pull --prefix code upstream-code release/1.62
```

For the main branch:

```bash
$ git subtree pull --prefix code upstream-code main
```

#### Checking the diff between local and remote

For a release branch:

```bash
$ git diff upstream-code/release/1.62 1.62.x:code
```

For a main branch:

```bash
$ git diff upstream-code/main main:code
```

## License Check for Eclipse Che extensions
License check tools work for the next extensions:
1. `che-activity-tracker`
2. `che-api`
3. `che-commands`
4. `che-github-authentication`
5. `che-port`
6. `che-remote`
7. `che-resource-monitor`
8. `che-terminal`

Dependencies usage restrictions could be checked with the `license:check` command. Example for `che-api`:

```bash
$ npm --prefix code/extensions/che-api run license:generate
```
This command will check the dependencies used in the `che-api` extension and generate a report with the following files:
 - `prod.md` with the list of production dependencies;
 - `dev.md` which contains only build and test dependencies;
 - `problems.md` will be created if some dependencies are not covered with the referenced IP request(CQ).

These files wil be in the `code/extensions/che-api/.deps` directory.

**Note**: Detailed information on how to create the required CQs with
         [clearlydefined](https://clearlydefined.io/) can be found [here](https://docs.clearlydefined.io/docs/get-involved/adding-sources).

## Fixing the [`rebase-insiders`](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml) Workflow?
Upstream VS Code changes may bring a breakage to Che-Code. In this case, the [`rebase-insiders`](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml) Workflow run is failed. To fix it, follow the steps below:
1. Checkout to a new branch, e.g.`fix-rebase`.
2. Fetch the latest changes from the upstream:
```
git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code main
```
3. `./rebase.sh`
4. Fix the conflicts or other errors. **Note**, that`./rebase.sh` script also applies the patches from the [`.rebase`](https://github.com/che-incubator/che-code/tree/main/.rebase) directory. Sometimes, it also requires some updates there.
5. Run the following commands to update `artifacts.lock.yaml`:
```bash
./build/artifacts/generate.sh
git add ./build/artifacts/artifacts.lock.yaml
git commit -m "chore: Update artifacts.lock.yaml" --signoff
git push origin fix-rebase
```
6. Open a PR with your changes.

## Branding the UI

   <details>
          <summary>You can brand some of the UI elements in the Visual Studio Code - Open Source IDE with your corporate or product brand.</summary>

\
This means first adding brand-related files to the forked IDE repository, then building a container image of the branded IDE, and finally adding a `che-editor.yaml` file to the project repository.

Here are some examples of the UI elements in Visual Studio Code - Open Source that you can brand:

* Browser tab title and icon
* The icon for the empty editor area when no editor is open
* The **Status Bar** commands
* The **Status Bar** icon
* The **Get Started** page
* The tab icon for the **Get Started** page
* The application name in the **About** dialog

### Prerequisites

* Bash
* `docker`

### Procedure

1\. Fork or download the Git [repository](https://github.com/che-incubator/che-code/tree/main/) of Visual Studio Code - Open Source IDE for Eclipse Che.

2\. In the `/branding/` folder of the repository, create the `product.json` file, which maps custom branding resources.

:bulb: In the `product.json` file, specify all paths relative the `/branding/` folder.

*Example. `/branding/product.json`*

The following example shows all of the properties that you can customize by using this file:

```json
{
    "nameShort": "Branded IDE",
    "nameLong": "Branded Instance of Eclipse Che with Branded Microsoft Visual Studio Code - Open Source IDE",
    "welcomePageTitle": "Branded Instance of Eclipse Che",
    "welcomePageSubtitle": "with Branded Microsoft Visual Studio Code - Open Source IDE",
    "icons": {
        "favicon": {
            "universal": "icons/favicon.ico"
        },
        "welcome": {
            "universal": "icons/icon.svg"
        },
        "statusBarItem": {
            "universal": "icons/icon.svg"
        },
        "letterpress": {
            "light": "icons/letterpress-light.svg",
            "dark": "icons/letterpress-light.svg"
        }
    },
    "remoteIndicatorCommands": {
        "openDocumentationCommand": "Branded IDE: Open Documentation",
        "openDashboardCommand": "Branded IDE: Open Dashboard",
        "openOpenShiftConsoleCommand": "Branded IDE: Open OpenShift Console",
        "stopWorkspaceAndRedirectToDashboard": "Branded IDE: Stop Workspace",
        "restartWorkspaceCommand": "Branded IDE: Restart Workspace",
        "restartWorkspaceFromLocalDevfileCommand": "Branded IDE: Restart Workspace from Local Devfile"
    },
    "workbenchConfigFilePath": "workbench-config.json",
    "codiconCssFilePath": "css/codicon.css"
}
```

`nameShort` is the application name for UI elements.

`nameLong` is the application name that is used for the **Welcome** page, **About** dialog, and browser tab title.

`welcomePageTitle` is the **Welcome** page title. The field is optional, the default is `nameLong` as the title.

`welcomePageSubtitle` - is the **Welcome** page subtitle. The field is optional, the default value comes from the upstream.

`favicon` is the icon for the browser tab title for all themes.

`welcome` is the icon for the tab title of the **Get Started** page for all themes.

`statusBarItem` is the icon for the bottom **Status Bar** for all themes. Define it as `codicon` in the `workbench-config.json` file and the `codicon` CSS styles.

`letterpress` is the icon for the empty editor area when no editor is open. You can provide different icon files for `light` and `dark` themes.

`remoteIndicatorCommands` is the names of commands provided by the [Eclipse Che Remote](https://github.com/che-incubator/che-code/blob/main/code/extensions/che-remote/package.nls.json) extension. Users can run these commands by clicking the **Status Bar**.

`workbenchConfigFilePath` is the relative path to `workbench-config.json`, which is explained in one of the next steps.

`codiconCssFilePath` is the relative path to `css/codicon.css`, which is explained in one of the next steps.

:grey_exclamation: The values defined in the `/branding/product.json` file override the [default values](https://github.com/che-incubator/che-code/blob/main/code/product.json).

3\. Add the icon files, which you specified in the `product.json` file in the previous step, to the repository.

4\. Create a `/branding/workbench-config.json` file with custom values.

*Example. `/branding/workbench-config.json`*

```json
{
	"windowIndicator": {
		"label": "$(eclipse-che) Branded IDE",
		"tooltip": "Branded IDE"
	},
	"configurationDefaults": {
		"workbench.colorTheme": "Dark",
		"workbench.colorCustomizations": {
			"statusBarItem.remoteBackground": "#FDB940",
			"statusBarItem.remoteForeground": "#525C86"
		}
	},
	"initialColorTheme": {
		"themeType": "dark",
		"colors": {
			"statusBarItem.remoteBackground": "#FDB940",
			"statusBarItem.remoteForeground": "#525C86"
		}
	}
}
```

`eclipse-che` in `"label": "$(eclipse-che) Eclipse Che"` is from `span.codicon.codicon-eclipse-che` in `/branding/css/codicon.css` in the next step.

5\. Create a `/branding/css/codicon.css` file with custom values.

*Example. `/branding/css/codicon.css`*

```css
span.codicon.codicon-eclipse-che  {
	background-image: url(./che/icon.svg);
	width: 13px;
	height: 13px;
}
```

6\. Run the `/branding/branding.sh` script. The [branding.sh](https://github.com/che-incubator/che-code/blob/main/branding/branding.sh) script searches for the branding resources in the [branding folder](https://github.com/che-incubator/che-code/tree/main/branding) and applies the changes.

```
$ ./branding/branding.sh
```
<!-- Currently, the [branding.sh](https://github.com/che-incubator/che-code/blob/main/branding/branding.sh) script is not run automatically when building this project. It needs to be integrated into the build process of the [downstream branded project or product](https://github.com/redhat-developer/devspaces-images/blob/devspaces-3-rhel-8/devspaces-code/build/scripts/sync.sh#L96). -->

7\. Build the container image from the `/che-code/` directory and push the image to a container registry:

```
$ docker build -f build/dockerfiles/linux-musl.Dockerfile -t linux-musl-amd64 .

$ docker build -f build/dockerfiles/linux-libc-ubi8.Dockerfile -t linux-libc-ubi8-amd64 .

$ docker build -f build/dockerfiles/linux-libc-ubi9.Dockerfile -t linux-libc-ubi9-amd64 .

$ export DOCKER_BUILDKIT=1

$ docker build -f build/dockerfiles/assembly.Dockerfile -t vs-code-open-source:next .

$ docker push <branding-organization>/vs-code-open-source:next
```

8\. Create a `/.che/che-editor.yaml` file in the remote repository that you intend to clone into workspaces. This file must specify the container image of your customized Visual Studio Code - Open Source that is to be pulled for new workspaces.

*Example. `/che-editor.yaml` for the branded Visual Studio Code - Open Source*

```yaml
inline:
  schemaVersion: 2.1.0
  metadata:
    name: che-code
  commands:
    - id: init-container-command
      apply:
        component: che-code-injector
  events:
    preStart:
      - init-container-command
  components:
    - name: che-code-runtime-description
      container:
        image: quay.io/devfile/universal-developer-image:ubi8-latest
        command:
          - /checode/entrypoint-volume.sh
        volumeMounts:
          - name: checode
            path: /checode
        memoryLimit: 2Gi
        memoryRequest: 256Mi
        cpuLimit: 500m
        cpuRequest: 30m
        endpoints:
          - name: che-code
            attributes:
              type: main
              cookiesAuthEnabled: true
              discoverable: false
              urlRewriteSupported: true
            targetPort: 3100
            exposure: public
            secure: false
            protocol: https
          - name: code-redirect-1
            attributes:
              discoverable: false
              urlRewriteSupported: true
            targetPort: 13131
            exposure: public
            protocol: http
          - name: code-redirect-2
            attributes:
              discoverable: false
              urlRewriteSupported: true
            targetPort: 13132
            exposure: public
            protocol: http
          - name: code-redirect-3
            attributes:
              discoverable: false
              urlRewriteSupported: true
            targetPort: 13133
            exposure: public
            protocol: http
      attributes:
        app.kubernetes.io/component: che-code-runtime
        app.kubernetes.io/part-of: che-code.eclipse.org
    - name: checode
      volume: {}
    - name: che-code-injector
      container:
        image: quay.io/branding-organization/vs-code-open-source:next
        command: ["/entrypoint-init-container.sh"]
        volumeMounts:
          - name: checode
            path: /checode
        memoryLimit: 128Mi
        memoryRequest: 32Mi
        cpuLimit: 500m
        cpuRequest: 30m
```

:grey_exclamation: In this example, `quay.io/branding-organization/vs-code-open-source:next` specifies the container image of a branded Visual Studio Code - Open Source IDE that will be pulled at workspace creation.

### Verification

1\. [Start a new workspace](https://www.eclipse.org/che/docs/stable/end-user-guide/starting-a-new-workspace-with-a-clone-of-a-git-repository/) with a clone of the project repository that contains the `che-editor.yaml` file.

2\. Check that the configured UI elements are correctly branded in Visual Studio Code - Open Source in the workspace.

</details>

<!-- FYI: https://github.com/redhat-developer/devspaces-images/tree/devspaces-3-rhel-8/devspaces-dashboard#branding -->

# Builds

This repo contains several [actions](https://github.com/che-incubator/che-code/actions), including:
* [![release latest stable](https://github.com/che-incubator/che-code/actions/workflows/release.yml/badge.svg)](https://github.com/che-incubator/che-code/actions/workflows/release.yml)
* [![upstream rebase](https://github.com/che-incubator/che-code/actions/workflows/image-publish.yml/badge.svg)](https://github.com/che-incubator/che-code/actions/workflows/image-publish.yml)

Downstream builds can be found at the link below, which is _internal to Red Hat_. Stable builds can be found by replacing the 3.x with a specific version like 3.2. 

* [code_3.x](https://main-jenkins-csb-crwqe.apps.ocp-c1.prod.psi.redhat.com/job/DS_CI/job/code_3.x/)

# License

- [Eclipse Public License 2.0](LICENSE)

# Trademark

"Che" is a trademark of the Eclipse Foundation.
