## Running Visual Studio Code - Open Source ("Code - OSS") in a UBI9-based container
`Node.js` version >=16.14.x and <17 [is required](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) to run `Code-OSS`.
This project includes [dockefiles](https://github.com/che-incubator/che-code/tree/main/build/dockerfiles) that based on the `ubi8/nodejs-16` image - an assembly contains `Node.js 16` that requires `OpenSSL 1`.

One of the differences between `UBI8` and `UBI9` image is:
- `UBI8` image uses `OpenSSL 1`
- `UBI9` image uses `OpenSSL 3`

 So, `Code-OSS` can be run in a `UBI8`-based container without additional requirements.

In order to run `Code-OSS` in a `UBI9`-based container you'll need the following:
- install `Node.js 16` which statically links against `OpenSSL 3`
- provide environment variable `VSCODE_NODEJS_RUNTIME_DIR` with the path to the installed node

For example:
```
FROM registry.access.redhat.com/ubi9/ubi:9.0.0-1576

RUN dnf install -y nodejs
ENV VSCODE_NODEJS_RUNTIME_DIR="/usr/bin"
```

The `RUN` instruction installs `Node.js 16` which statically links against `OpenSSL 3` as the image is based on the `UBI9` image.
The `ENV` instruction provides the env variable to let `che-code` know where the `Node.js` is placed.

NOTE:
- `UBI9`-based container might contain few versions of `Node.js`
- any version of `Node.js` can be used as default
- the environment variable `VSCODE_NODEJS_RUNTIME_DIR` should be provided to let `che-code` know which `Node.js` should be used for running `Code-OSS`
