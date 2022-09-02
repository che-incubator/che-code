# che-code

Deploy `Code-OSS` on a kubernetes cluster and connect with your Browser.

This repository is hosting the changes to have the `Code-OSS` running inside a Browser and connecting to a remote HTTP(s) server (instead of using Desktop mode).

The terminal is aware of the running Pod. Then, you can open terminals in every container of the running pod (if the containers have shell access).

Upstream `Code-OSS` is stored using Git [subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge). It means that if you're not interested in updating/rebasing upstream code you don't need to setup anything else unlike git submodules. This repository is self-contained.

## Development pre-requisites
 - NodeJS version used by `Code-OSS` (Exact version can be find inside https://github.com/microsoft/vscode/blob/main/remote/.yarnrc with target property)
 - Yarn v1.x

## Directories layout

- `code` contains the upstream content (subtree) + changes required to have Code running in a remote server.
- `build/dockerfiles` are for building a container.
- `package.json` holds some top-level scripts that you can find also in the `code` folder.

## Development mode

1. Fetch dependencies with `yarn` command
2. Compile and watch folders: `yarn run watch`
3. Run the server (another terminal for example): `yarn run server`

## Image build

1. `docker build -f build/dockerfiles/linux-musl.Dockerfile -t linux-musl-amd64 .`
2. `docker build -f build/dockerfiles/linux-libc.Dockerfile -t linux-libc-amd64 .`
3. `export DOCKER_BUILDKIT=1`
4. `docker build -f build/dockerfiles/assembly.Dockerfile -t che-code .`

## Developing with Eclipse Che

This project includes [Devfile](devfile.yaml) that simplifies developing Che-Code in Eclipse Che.
To test your changes in Eclipse Che run the following VS Code Tasks:
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

#### Pull changes from the remote Code

For a release branch:

```bash
$ git subtree pull --prefix code upstream-code release/1.62
```

For the main branch:

```bash
$ git subtree pull --prefix code upstream-code main
```

#### Check the diff between local and remote

For a release branch:

```bash
$ git diff upstream-code/release/1.62 1.62.x:code
```

For a main branch:

```bash
$ git diff upstream-code/main main:code
```

## How to fix the [`rebase-insiders`](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml) Workflow?
Upstream VS Code changes may bring a breakage to Che-Code. In this case, the [`rebase-insiders`](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml) Workflow run is failed. To fix it, follow the steps below:
1. Checkout to a new branch, e.g.`fix-rebase`.
2. Fetch the latest changes from the upstream:
```
git remote add upstream-code https://github.com/microsoft/vscode
git fetch upstream-code main
```
3. `./rebase.sh`
4. Fix the conflicts or other errors. **Note**, that`./rebase.sh` script also apllies the patches from the [`.rebase`](https://github.com/che-incubator/che-code/tree/main/.rebase) directory. Sometimes, it also requires some updates there.
5. Open a PR with your changes.

## Whitelabel/branding
 
There is an ability to apply branding for some UI elements. The original data can be overridden by execution [branding.sh script](https://github.com/che-incubator/che-code/blob/main/branding/branding.sh). The script expects that the branding resources are placed in the [branding folder](https://github.com/che-incubator/che-code/tree/main/branding). 

The crucial one is: `product.json` file. 
The values defined in the `branding/product.json` file overwrite [default ones](https://github.com/che-incubator/che-code/blob/main/code/product.json). 
Also the file serves data mapping for provided branding resources.

Example of the `branding/product.json` file:
```
{
	"nameShort": "Visual Studio Code - Open Source",
	"nameLong": "Red Hat OpenShift Dev Spaces - Visual Studio Code - Open Source IDE container",
	"icons": {
		"favicon": {
			"universal": "icons/favicon.ico"
		},
		"welcome": {
			"universal": "icons/dev-spaces.svg"
		},
		"statusBarItem": {
			"universal": "icons/dev-spaces.svg"
		},
		"letterpress": {
			"light": "icons/letterpress-light.svg",
			"dark": "icons/letterpress-light.svg"
		}
	},
	"remoteIndicatorCommands": {
		"openDocumentationCommand": "Dev Spaces: Open Documentation",
		"openDashboardCommand": "Dev Spaces: Open Dashboard",
		"stopWorkspaceCommand": "Dev Spaces: Stop Workspace"
	},
	"workbenchConfigFilePath": "workbench-config.json",
	"codiconCssFilePath": "css/codicon.css"
}
```
- `nameShort` - application name
- `nameLong` - it's used for the `Welcome` page, the `About` dialog, browser tab title
- `favicon` - icon for the browser tab title, the same for all themes
- `welcome` - icon for the `Welcome` (`Get Started`) page tab title, the same for all themes
- `statusBarItem` - icon for the status bar item, the same for all themes, should be defined as `codicon` in the `workbench-config.json` file and `codicon` css styles as well
- `letterpress` - icon for the main area when all editors are closed, it's possible to provide different icons for the `light` and `dark` theme  
- `remoteIndicatorCommands` - names of commands provided by [`Eclipse Che Remote` extension](https://github.com/che-incubator/che-code/blob/main/code/extensions/che-remote/package.nls.json)
- `workbenchConfigFilePath` - the config file path, please see an example of the config file [here](https://github.com/che-incubator/che-code/blob/main/code/src/vs/code/browser/workbench/che/workbench-config.json)
- `codiconCssFilePath` - the codicon css file path, should contain css styles for `codicon`s, content of the file is appended to [the coressponding css file](https://github.com/che-incubator/che-code/blob/main/code/src/vs/base/browser/ui/codicons/codicon/codicon.css), please see an example of the content [here](https://github.com/che-incubator/che-code/blob/803b864e8411bd57d617dabddfd8a132fac6c743/code/src/vs/base/browser/ui/codicons/codicon/codicon.css#L29-L33)

Please note:
-  it's expected that all paths in the `branding/product.json` file are relative to the `branding` folder. 
For example, `workbenchConfigFilePath` field has `anyFolder/myConfigFiles/workbench-config.json` value. 
It means that the config file can be found by the path: `che-code/branding/anyFolder/myConfigFiles/workbench-config.json`
- At the moment the [branding.sh script](https://github.com/che-incubator/che-code/blob/main/branding/branding.sh) is not run automatically (at building project, for example), it should be integrated in the project workflow.

# License

- [Eclipse Public License 2.0](LICENSE)
