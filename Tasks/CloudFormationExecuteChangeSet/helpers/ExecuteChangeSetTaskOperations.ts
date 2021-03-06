/*
  * Copyright 2017 Amazon.com, Inc. and its affiliates. All Rights Reserved.
  *
  * Licensed under the MIT License. See the LICENSE accompanying this file
  * for the specific language governing permissions and limitations under
  * the License.
  */

import tl = require('vsts-task-lib/task');
import path = require('path');
import fs = require('fs');
import CloudFormation = require('aws-sdk/clients/cloudformation');
import { AWSError } from 'aws-sdk/lib/error';
import sdkutils = require('sdkutils/sdkutils');

import Parameters = require('./ExecuteChangeSetTaskParameters');

export class TaskOperations {

    public static async executeChangeSet(taskParameters: Parameters.TaskParameters): Promise<void> {

        await this.createServiceClients(taskParameters);

        const stackId = await this.verifyResourcesExist(taskParameters.changeSetName, taskParameters.stackName);
        let waitForStackUpdate: boolean = false;
        if (stackId) {
            waitForStackUpdate = await this.testStackHasResources(taskParameters.stackName);
        }

        console.log(tl.loc('ExecutingChangeSet', taskParameters.changeSetName, taskParameters.stackName));

        try {
            await this.cloudFormationClient.executeChangeSet({
                ChangeSetName: taskParameters.changeSetName,
                StackName: taskParameters.stackName
            }).promise();

            if (waitForStackUpdate) {
                await this.waitForStackUpdate(taskParameters.stackName);
            } else {
                await this.waitForStackCreation(taskParameters.stackName);
            }

            if (taskParameters.outputVariable) {
                console.log(tl.loc('SettingOutputVariable', taskParameters.outputVariable));
                tl.setVariable(taskParameters.outputVariable, stackId);
            }

            console.log(tl.loc('TaskCompleted', taskParameters.changeSetName));
        } catch (err) {
            console.error(tl.loc('ExecuteChangeSetFailed', err.message), err);
            throw err;
        }
    }

    private static cloudFormationClient: CloudFormation;

    private static async createServiceClients(taskParameters: Parameters.TaskParameters): Promise<void> {

        const cfnOpts: CloudFormation.ClientConfiguration = {
            apiVersion: '2010-05-15',
            credentials: taskParameters.Credentials,
            region: taskParameters.awsRegion
        };
        this.cloudFormationClient = sdkutils.createAndConfigureSdkClient(CloudFormation, cfnOpts, taskParameters, tl.debug);
    }

    private static async verifyResourcesExist(changeSetName: string, stackName: string): Promise<string> {

        try {
            const request: CloudFormation.DescribeChangeSetInput = {
                ChangeSetName: changeSetName
            };
            if (stackName) {
                request.StackName = stackName;
            }

            const response = await this.cloudFormationClient.describeChangeSet(request).promise();
            return response.StackId;
        } catch (err) {
            throw new Error(tl.loc('ChangeSetDoesNotExist', changeSetName));
        }
    }

    // Stacks 'created' with a change set are not fully realised until the change set
    // executes, so we inspect whether resources exist in order to know which kind
    // of 'waiter' to use (create complete, update complete) when running a stack update.
    // It's not enough to know that the stack exists.
    private static async testStackHasResources(stackName: string): Promise<boolean> {
        try {
            const response = await this.cloudFormationClient.describeStackResources({ StackName: stackName }).promise();
            return (response.StackResources && response.StackResources.length > 0);
        } catch (err) {
            return false;
        }
    }

    private static async waitForStackCreation(stackName: string) : Promise<void> {
        console.log(tl.loc('WaitingForStackCreation', stackName));
        try {
            await this.cloudFormationClient.waitFor('stackCreateComplete', { StackName: stackName }).promise();
            console.log(tl.loc('StackCreated', stackName));
        } catch (err) {
            throw new Error(tl.loc('StackCreationFailed', stackName, err.message));
        }
    }

    private static async waitForStackUpdate(stackName: string) : Promise<void> {
        console.log(tl.loc('WaitingForStackUpdate', stackName));
        try {
            await this.cloudFormationClient.waitFor('stackUpdateComplete', { StackName: stackName }).promise();
            console.log(tl.loc('StackUpdated', stackName));
        } catch (err) {
            throw new Error(tl.loc('StackUpdateFailed', stackName, err.message));
        }
    }

}
