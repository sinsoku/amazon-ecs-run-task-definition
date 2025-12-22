const { run, parseCommand } = require('.');
const core = require('@actions/core');

jest.mock('@actions/core');

const mockSend = jest.fn();
const mockConfigRegion = jest.fn().mockResolvedValue('fake-region');
jest.mock('@aws-sdk/client-ecs', () => {
    return {
        ECSClient: jest.fn(() => ({
            send: mockSend,
            config: {
                region: mockConfigRegion
            }
        })),
        DescribeServicesCommand: jest.fn((input) => ({ type: 'DescribeServicesCommand', input })),
        RunTaskCommand: jest.fn((input) => ({ type: 'RunTaskCommand', input })),
        DescribeTasksCommand: jest.fn((input) => ({ type: 'DescribeTasksCommand', input })),
        waitUntilTasksStopped: jest.fn()
    };
});

const { waitUntilTasksStopped, DescribeServicesCommand, RunTaskCommand, DescribeTasksCommand } = require('@aws-sdk/client-ecs');

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

        mockSend.mockImplementation((command) => {
            if (command.type === 'DescribeServicesCommand') {
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
            if (command.type === 'RunTaskCommand') {
                return Promise.resolve({
                    failures: [],
                    tasks: [{
                        taskArn: 'arn:aws:ecs:fake-region:123456789012:task/01234-abcd'
                    }]
                });
            }
            if (command.type === 'DescribeTasksCommand') {
                return Promise.resolve({
                    tasks: [{
                        containers: [{
                            exitCode: 0
                        }]
                    }]
                });
            }
            return Promise.reject(new Error('Unknown command'));
        });
    });

    test('run a task definition', async () => {
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(DescribeServicesCommand).toHaveBeenCalledWith({
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(RunTaskCommand).toHaveBeenCalledWith({
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
        expect(waitUntilTasksStopped).toHaveBeenCalledTimes(0);
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/cluster-789/tasks/01234-abcd/details");
    });

    test('run a task, waits for stopped state', async () => {
        waitUntilTasksStopped.mockResolvedValue({ state: 'SUCCESS' });

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
        expect(DescribeServicesCommand).toHaveBeenCalledWith({
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(RunTaskCommand).toHaveBeenCalledWith({
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
        expect(waitUntilTasksStopped).toHaveBeenCalledTimes(1);
        expect(DescribeTasksCommand).toHaveBeenCalledWith({
            cluster: 'cluster-789',
            tasks: ['arn:aws:ecs:fake-region:123456789012:task/01234-abcd']
        });
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/cluster-789/tasks/01234-abcd/details");
    });

    test('run a task, but failed', async () => {
        waitUntilTasksStopped.mockResolvedValue({ state: 'SUCCESS' });

        mockSend.mockImplementation((command) => {
            if (command.type === 'DescribeServicesCommand') {
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
            if (command.type === 'RunTaskCommand') {
                return Promise.resolve({
                    failures: [],
                    tasks: [{
                        taskArn: 'arn:aws:ecs:fake-region:123456789012:task/01234-abcd'
                    }]
                });
            }
            if (command.type === 'DescribeTasksCommand') {
                return Promise.resolve({
                    tasks: [{
                        containers: [{
                            exitCode: 1
                        }]
                    }]
                });
            }
            return Promise.reject(new Error('Unknown command'));
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
