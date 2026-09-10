# Adding a container environment variable

Environment variables defined in the Devfile will be propagated to every process running in the container. Including the IDE (e.g. Visual Studio Code), the commands specified in the Devfile itself and the terminal.

```yaml
env:
  - name: WELCOME
    value: "Hello World"
```

References:
- [Corresponding article in the Devfile documentation][def1]
- [`env` definition in the Devfile API reference][def2]

[def1]: https://devfile.io/docs/2.2.2/defining-environment-variables
[def2]: https://devfile.io/docs/2.2.2/devfile-schema#components-container-env