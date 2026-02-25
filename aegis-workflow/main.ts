// main.ts
// Entry point for the Aegis Protocol CRE workflow.
// Registers HTTP triggers and routes to appropriate payment function handlers.

import {
  cre,
  Runner,
} from "@chainlink/cre-sdk";
import {
  configSchema,
  type Config,
} from "./types";
// Import HTTP callback router
import { onHttpTrigger } from "./cre-callbacks";

/*********************************
 * Workflow Initialization
 *********************************/

/**
 * Initializes the CRE workflow by setting up the HTTP trigger.
 * Routes incoming HTTP requests to appropriate payment function handlers.
 * 
 * @param config - Validated workflow configuration
 * @returns Array of CRE handlers
 */
const initWorkflow = (config: Config) => {
  // Validate configuration against schema
  const validatedConfig = configSchema.parse(config);

  // Initialize HTTP capability for payment function requests
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  return [
    // HTTP Trigger - Aegis Protocol Payment Router
    cre.handler(httpTrigger, onHttpTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
