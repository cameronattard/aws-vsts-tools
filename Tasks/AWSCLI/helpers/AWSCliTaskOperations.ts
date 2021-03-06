/*
  * Copyright 2017 Amazon.com, Inc. and its affiliates. All Rights Reserved.
  *
  * Licensed under the MIT License. See the LICENSE accompanying this file
  * for the specific language governing permissions and limitations under
  * the License.
  */

import { parse, format, Url } from 'url';
import tl = require('vsts-task-lib/task');
import tr = require('vsts-task-lib/toolrunner');
import Parameters = require('./AWSCliTaskParameters');

export class TaskOperations {
    public static checkIfAwsCliIsInstalled() {
        try {
            return !!tl.which('aws', true);
        } catch (error) {
            tl.setResult(tl.TaskResult.Failed, tl.loc('AWSCLINotInstalled'));
        }
    }

    public static async executeCommand(taskParameters: Parameters.TaskParameters) {
        try {
            await this.configureAwsCli(taskParameters);
            await taskParameters.configureHttpProxyFromAgentProxyConfiguration('AWSCLI');

            const awsCliPath = tl.which('aws');
            const awsCliTool: tr.ToolRunner = tl.tool(awsCliPath);
            awsCliTool.arg(taskParameters.awsCliCommand);
            awsCliTool.arg(taskParameters.awsCliSubCommand);
            if (taskParameters.awsCliParameters != null) {
                awsCliTool.line(taskParameters.awsCliParameters);
            }
            const code: number = await awsCliTool.exec(<tr.IExecOptions>{ failOnStdErr: taskParameters.failOnStandardError });
            tl.debug(`return code: ${code}`);
            if (code !== 0) {
                tl.setResult(tl.TaskResult.Failed, tl.loc('AwsReturnCode', awsCliTool, code));
            } else {
                tl.setResult(tl.TaskResult.Succeeded, tl.loc('AwsReturnCode', awsCliTool, code));
            }
        } catch (err) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        }
    }

    private static async configureAwsCli(taskParameters: Parameters.TaskParameters) {
        const awsCliPath = tl.which('aws');

        // if assume role credentials are in play, make sure the initial generation
        // of temporary credentials has been performed
        await taskParameters.Credentials.getPromise().then(() => {
            tl.debug('configure access key');
            const accessKeyCliTool: tr.ToolRunner = tl.tool(awsCliPath);
            accessKeyCliTool.line('configure set aws_access_key_id');
            accessKeyCliTool.arg(taskParameters.Credentials.accessKeyId);
            accessKeyCliTool.execSync(<tr.IExecOptions>{ failOnStdErr: taskParameters.failOnStandardError });

            tl.debug('configure secret access key');
            const secretKeyCliTool: tr.ToolRunner = tl.tool(awsCliPath);
            secretKeyCliTool.line('configure set aws_secret_access_key');
            secretKeyCliTool.arg(taskParameters.Credentials.secretAccessKey);
            secretKeyCliTool.execSync(<tr.IExecOptions>{ failOnStdErr: taskParameters.failOnStandardError });

            if (taskParameters.Credentials.sessionToken) {
                tl.debug('configure session token');
                const sessionTokenCliTool: tr.ToolRunner = tl.tool(awsCliPath);
                sessionTokenCliTool.line('configure set aws_session_token');
                sessionTokenCliTool.arg(taskParameters.Credentials.sessionToken);
                sessionTokenCliTool.execSync(<tr.IExecOptions>{ failOnStdErr: taskParameters.failOnStandardError });
            }

            tl.debug('configure region');
            const awsCliTool3: tr.ToolRunner = tl.tool(awsCliPath);
            awsCliTool3.line('configure set');
            awsCliTool3.arg('default.region');
            awsCliTool3.arg(taskParameters.awsRegion);
            awsCliTool3.execSync(<tr.IExecOptions>{ failOnStdErr: taskParameters.failOnStandardError });
        });
    }
}
