const run = require('.');
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

        mockEcsWaiter.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
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
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/apps/tasks/01234-abcd/details");
    });

    test('run a task definition, waits for stopped state', async () => {
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
        expect(core.info).toBeCalledWith("Task started. Watch this task's details in the Amazon ECS console: https://console.aws.amazon.com/ecs/home?fake-region#/clusters/apps/tasks/01234-abcd/details");
    });
});
