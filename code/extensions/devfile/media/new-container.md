# Adding a container component

To customize the container that hosts the Cloud Development Environment, provide a specific image using the `container` component type.

```yaml
components:
  - name: dev
    container:
        image: quay.io/devfile/universal-developer-image:latest
        memoryRequest: 256Mi
        memoryLimit: 2048Mi
        cpuRequest: 0.1
        cpuLimit: 0.5
```

References:
- [Corresponding article in the Devfile documentation][def1]
- [`container` in the Devfile API reference][def2]

[def1]: https://devfile.io/docs/2.2.2/adding-a-container-component
[def2]: https://devfile.io/docs/2.2.2/devfile-schema#components-container