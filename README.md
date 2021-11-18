# che-code

Deploy `Code-OSS` on a kubernetes cluster and connect with your Browser.

This repository is hosting the changes to have the `Code-OSS` running inside a Browser and connecting to a remote HTTP(s) server (instead of using Desktop mode).

The terminal is aware of the running Pod. Then, you can open terminals in every container of the running pod (if the containers have shell access).

Upstream `Code-OSS` is stored using Git [subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge). It means that if you're not interested in updating/rebasing upstream code you don't need to setup anything else unlike git submodules. This repository is self-contained.

## Development pre-requisites
 - NodeJS version used by `Code-OSS` (Exact version can be find inside https://github.com/microsoft/vscode/blob/main/remote/.yarnrc with target property)
 - Yarn v1.x

## Directories Layout

- `code` contains the upstream content (subtree) + changes required to have Code running in a remote server.
- `deploy/helm`: Helm templates to deploy it on a k8s cluster
- `Dockerfile` is for building the container.
- `package.json` holds some top-level scripts that you can find also in the `code` folder.

## Development mode

1. Fetch dependencies with `yarn` command
2. Compile and watch folders: `yarn run watch`
3. Run the server (another terminal for example): `yarn run server`


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

