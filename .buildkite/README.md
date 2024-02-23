Ensure the YAML steps in buildkite contains the below so your build knows where your `pipeline.yml` file is. **Don’t add this to your `pipeline.yml` otherwise you’ll end up with a fork bomb.**

```
steps:
  - label: ":pipeline: Pipeline upload"
    command: buildkite-signed-pipeline upload
```
