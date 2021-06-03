const { run, parseCommand } = require('.');
const core = require('@actions/core');

jest.mock('@actions/core');

const mockEcsDescribeServices = jest.fn();
const mockEcsRunTask = jest.fn();
const mockEcsWaiter = jest.fn();
jest.mock('aws-sdk', () => {
    return {
        config: {
            region: 'fake-region'
        },
        ECS: jest.fn(() => ({
            describeServices: mockEcsDescribeServices,
            runTask: mockEcsRunTask,
            waitFor: mockEcsWaiter
        }))
    };
});

describe('Run a task', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task:1')                   // task-definition
            .mockReturnValueOnce('container-123')            // container
            .mockReturnValueOnce('["echo", "Hello, World"]') // command
            .mockReturnValueOnce('service-456')              // service
            .mockReturnValueOnce('cluster-789');             // cluster

        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            launchType: 'FARGATE',
                            networkConfiguration: {
                                awsvpcConfiguration: {
                                    subnets: ['subnet-123', 'subnet-456'],
                                    assignPublicIp: 'DISABLED',
                                    securityGroups: ['sg-123']
                                }
                            }
                        }]
                    });
                }
            };
        });

        mockEcsRunTask.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        tasks: [{
                            taskArn: 'arn:aws:ecs:fake-region:123456789012:task/01234-abcd'
                        }]
                    });
                }
            };
        });
    });

    test('run a task definition', async () => {
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(mockEcsRunTask).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            taskDefinition: 'task:1',
            launchType: 'FARGATE',
            networkConfiguration: {
              awsvpcConfiguration: {
                subnets: ['subnet-123', 'subnet-456'],
                assignPublicIp: 'DISABLED',
                securityGroups: ['sg-123']
              }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'container-123',
                        command: ["echo", "Hello, World"]
                    }
                ]
            }
        });
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-arn', 'arn:aws:ecs:fake-region:123456789012:task/01234-abcd');
        expect(mockEcsWaiter).toHaveBeenCalledTimes(0);
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/cluster-789/tasks/01234-abcd/details");
    });

    test('run a task, waits for stopped state', async () => {
        mockEcsWaiter.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        tasks: [{
                          containers: [{
                            exitCode: 0
                          }]
                        }]
                    });
                }
            };
        });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task:1')                   // task-definition
            .mockReturnValueOnce('container-123')            // container
            .mockReturnValueOnce('["echo", "Hello, World"]') // command
            .mockReturnValueOnce('service-456')              // service
            .mockReturnValueOnce('cluster-789')              // cluster
            .mockReturnValueOnce('TRUE');                    // wait-for-stopped

        await run();

        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(mockEcsRunTask).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            taskDefinition: 'task:1',
            launchType: 'FARGATE',
            networkConfiguration: {
              awsvpcConfiguration: {
                subnets: ['subnet-123', 'subnet-456'],
                assignPublicIp: 'DISABLED',
                securityGroups: ['sg-123']
              }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'container-123',
                        command: ["echo", "Hello, World"]
                    }
                ]
            }
        });
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-arn', 'arn:aws:ecs:fake-region:123456789012:task/01234-abcd');
        expect(mockEcsWaiter).toHaveBeenCalledTimes(1);
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/cluster-789/tasks/01234-abcd/details");
    });

    test('run a task, but failed', async () => {
        mockEcsWaiter.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        tasks: [{
                          containers: [{
                            exitCode: 1
                          }]
                        }]
                    });
                }
            };
        });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task:1')                   // task-definition
            .mockReturnValueOnce('container-123')            // container
            .mockReturnValueOnce('["bad-command"]')          // command
            .mockReturnValueOnce('service-456')              // service
            .mockReturnValueOnce('cluster-789')              // cluster
            .mockReturnValueOnce('TRUE');                    // wait-for-stopped

        await run();

        expect(core.setFailed).toBeCalledWith("The exit code was 1 in the container.");
    });
});

describe('parseCommand', () => {
  test('JSON list format string', () => {
    const actual = parseCommand('["echo", "Hello, World"]');
    expect(actual).toEqual(["echo", "Hello, World"]);
  });

  test('string', () => {
    const actual = parseCommand('echo foo');
    expect(actual).toEqual(["echo", "foo"]);
  });

  test('string including \n', () => {
    const actual = parseCommand("echo\n  'Hello, World'");
    expect(actual).toEqual(["echo", "'Hello, World'"]);
  });
});
