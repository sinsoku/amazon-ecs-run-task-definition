const core = require('@actions/core');
const aws = require('aws-sdk');

function parseCommand(command) {
  // for backwards compatibility
  if (command[0] === '[') {
    return JSON.parse(command);
  }

  const separator = command.includes("\n") ? "\n" : " ";
  return command.split(separator).map(s => s.trim());
}

async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'amazon-ecs-run-task-definition-for-github-actions'
    });

    // Get inputs
    const taskDefinition = core.getInput('task-definition', { required: true });
    const container = core.getInput('container', { required: true });
    const command = core.getInput('command', { required: true });
    const service = core.getInput('service', { required: true });
    const cluster = core.getInput('cluster', { required: true });
    const waitForStopped = core.getInput('wait-for-stopped', { required: false });

    // Fetch the configuration from a service
    core.debug('Fetch the configuration');
    let describeResponse;
    try {
      describeResponse = await ecs.describeServices({
        services: [service],
        cluster: cluster
      }).promise();
    } catch (error) {
      core.setFailed("Failed to fetch the configuration from a service: " + error.message);
      throw(error);
    }
    const serviceResponse = describeResponse.services[0];

    // Starts a new task
    let taskResponse;
    try {
      const commandList = parseCommand(command);
      taskResponse = await ecs.runTask({
        capacityProviderStrategy: serviceResponse.capacityProviderStrategy,
        cluster: cluster,
        taskDefinition: taskDefinition,
        launchType: serviceResponse.launchType,
        networkConfiguration: serviceResponse.networkConfiguration,
        overrides: {
          containerOverrides: [
            {
              name: container,
              command: commandList
            }
          ]
        }
      }).promise();
    } catch (error) {
      core.setFailed("Failed to start a task in ECS: " + error.message);
      throw(error);
    }
    const taskArn = taskResponse.tasks[0].taskArn;
    core.setOutput('task-arn', taskArn);
    const taskId = taskArn.split('/').pop();
    core.info(`Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?${aws.config.region}#/clusters/${cluster}/tasks/${taskId}/details`);

    // Wait for the task to stop
    if (waitForStopped && waitForStopped.toLowerCase() === 'true') {
      const waitResponse = await ecs.waitFor('tasksStopped', {
        cluster: cluster,
        tasks: [taskArn]
      }).promise();

      const task = waitResponse.tasks[0];
      const failedContainer = task.containers.find(c => c.exitCode != 0);
      if (failedContainer) {
        core.setFailed(`The exit code was ${failedContainer.exitCode} in the container.`);
      }
    } else {
      core.debug('Not waiting for the task to stop');
    }
  }
  catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

module.exports = { run, parseCommand };

/* istanbul ignore next */
if (require.main === module) {
    run();
}
