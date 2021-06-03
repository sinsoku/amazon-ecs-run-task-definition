## Amazon ECS "Run Task Definition" Action for GitHub Actions

Run an Amazon ECS task definition on the same configuration as the existing ECS service.

## Usage

```yaml
    - name: Run a task on Amazon ECS
      uses: sinsoku/amazon-ecs-run-task-definition@v1
      with:
        task-definition: foo:1
        container: my-container
        command: |
          echo
          "Hello, World"
        service: my-service
        cluster: my-cluster
        wait-for-stopped: true
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.
