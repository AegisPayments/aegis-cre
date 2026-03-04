// main.ts
// Entry point for the Aegis Protocol CRE workflow.
// Registers HTTP triggers and routes to appropriate payment function handlers.

import {
  cre,
  Runner,
  getNetwork,
} from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import {
  configSchema,
  type Config,
} from "./types";
// Import HTTP callback router
import { onHttpTrigger } from "./cre-callbacks";
// Import log callback handlers
import { onCapturedLog } from "./cre-callbacks/log-callbacks/captured-funds";
import { onFundsReleasedLog } from "./cre-callbacks/log-callbacks/funds-released";

/*********************************
 * Workflow Initialization
 *********************************/

/**
 * Initializes the CRE workflow by setting up triggers.
 * - HTTP trigger: Routes payment function requests to appropriate handlers
 * - EVM log triggers: Captures Captured and FundsReleased events for audit logging
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

  // Initialize EVM log triggers for audit logging
  const evmConfig = validatedConfig.evmConfigs[0]; // Use first EVM config

  // Get network configuration 
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector name: ${evmConfig.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Event signatures for the log triggers
  const capturedEventSignature = "Captured(address,address,uint256)";
  const fundsReleasedEventSignature = "FundsReleased(address,address,uint256)";

  // Compute event topic hashes
  const capturedHash = keccak256(toHex(capturedEventSignature));
  const fundsReleasedHash = keccak256(toHex(fundsReleasedEventSignature));

  return [
    // HTTP Trigger - Aegis Protocol Payment Router
    cre.handler(httpTrigger, onHttpTrigger),

    // EVM Log Trigger - Captured Events
    cre.handler(
      evmClient.logTrigger({
        addresses: [evmConfig.contractAddress],
        topics: [{ values: [capturedHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onCapturedLog
    ),

    // EVM Log Trigger - FundsReleased Events
    cre.handler(
      evmClient.logTrigger({
        addresses: [evmConfig.contractAddress],
        topics: [{ values: [fundsReleasedHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onFundsReleasedLog
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
