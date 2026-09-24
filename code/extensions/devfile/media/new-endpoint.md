# Defining endpoints

This section describes how to define endpoints and specify their properties. Endpoints help connecting to the applications running in a Cloud Development Environment. An endpoint defined in Devfile can use an existing Kubernetes ingress (the default) or require a dedicated one (when the attribute `urlRewriteSupported` is set to `false`).  

```yaml
endpoints:
  - name: api
    targetPort: 8080
    exposure: public
```

References:
- [Corresponding article in the Devfile documentation][def1]
- [`endpoints` definition in the Devfile API reference][def2]

[def1]: https://devfile.io/docs/2.2.2/defining-endpoints
[def2]: https://devfile.io/docs/2.2.2/devfile-schema#components-container-endpoints
