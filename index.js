/*global AWS*/
const path = require('path');
const aws = require('aws-sdk');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const awsSmName = core.getInput('aws-sm-name', { required: false });

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
    }
    
    const taskDefContents = require(taskDefPath);

    // Insert the image URI
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error('Invalid task definition format: containerDefinitions section is not present or is not an array');
    }
    
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == containerName;
    });
    
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }

    containerDef.image = imageURI;
    console.log(`Using ${awsSmName} Secret Manager`);
    if (awsSmName) {
      AWS.config.setPromisesDependency(Promise);
      const sm = new aws.SecretsManager();
      const smResponse = await sm.getSecretValue({
        SecretId: awsSmName
      }).promise();
      console.log('Response:');
      console.log(smResponse);
      const { SecretString } = smResponse.data
      console.log(`SecretString: ${SecretString}`);
      containerDef.environment = Object.entries(JSON.parse(SecretString)).map(([name, value]) => ({
        name,
        value
      }))
    }

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      dir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true
    });
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
  run();
}
