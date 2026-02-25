// main.ts
// Entry point for the Aegis AI Risk Engine - CRE payment risk assessment workflow.
// Registers an HTTP trigger and orchestrates the full risk assessment flow.

import {
  cre,
  Runner,
  getNetwork,
  type Runtime,
  type HTTPPayload,
  bytesToHex,
  hexToBase64,
  TxStatus,
  decodeJson
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import {
  configSchema,
  type Config,
  type RiskAssessmentPayload,
  type GeminiResponse,
  type FirestoreWriteResponse,
  type TransactionHistoryItem,
  type RiskAssessmentContext,
  type LLMResult,
  GeminiResponseSchema
} from "./types";
// Import AI Risk Engine helpers  
import { assessPaymentRisk } from "./gemini";
import { getRecentTransactions, writeRiskAssessmentLog } from "./firebase";

// ABI parameters for secureIncrement function
const SECURE_INCREMENT_PARAMS = parseAbiParameters("address user, address merchant, uint256 requestedTotal, string reason");

/*********************************
 * HTTP Trigger Handler - Risk Assessment
 *********************************/

/**
 * Handles HTTP requests for payment risk assessment via the Aegis AI Risk Engine.
 * Orchestrates the full assessment flow: History → AI Assessment → On-chain Action → Logging.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param payload - HTTP payload containing the risk assessment request
 * @returns Success message or error response
 */
// TODO: since in deployed workflows http tirgger can get called by authorized keys, we can trust the recieved payload for now.
const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("Aegis AI Risk Engine: Payment Risk Assessment");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  let txHash = ""; // Will be populated if transaction is executed
  let riskPayload: RiskAssessmentPayload | undefined;
  let geminiResponse: GeminiResponse | undefined;

  try {
    // ═══════════════════════════════════════════════════════════════
    // Step 1: Parse and validate the incoming risk assessment request
    // ═══════════════════════════════════════════════════════════════
    if (!payload.input || payload.input.length === 0) {
      runtime.log("[ERROR] Empty request payload");
      return JSON.stringify({ status: "error", message: "Empty request payload" });
    }

    let inputString: string;

    // Handle different payload input formats
    if (typeof payload.input === 'string') {
      inputString = payload.input;
    } else if (payload.input instanceof Uint8Array) {
      inputString = new TextDecoder().decode(payload.input);
    } else {
      // Try decodeJson for other formats
      inputString = decodeJson(payload.input);
    }

    riskPayload = JSON.parse(inputString) as RiskAssessmentPayload;
    runtime.log(`[Step 1] Risk Assessment Request:`);
    runtime.log(`  Merchant Type: ${riskPayload.merchantType}`);
    runtime.log(`  User: ${riskPayload.user}`);
    runtime.log(`  Merchant: ${riskPayload.merchant}`);
    runtime.log(`  Current Auth: $${riskPayload.currentAuth}`);
    runtime.log(`  Requested Total: $${riskPayload.requestedTotal}`);
    runtime.log(`  Reason: "${riskPayload.reason}"`);

    // Validate required fields
    if (!riskPayload.merchantType || !riskPayload.user || !riskPayload.merchant ||
      riskPayload.currentAuth === undefined || riskPayload.requestedTotal === undefined || !riskPayload.reason) {
      runtime.log("[ERROR] Missing required fields in risk assessment request");
      return JSON.stringify({
        status: "error",
        message: "Missing required fields: merchantType, user, merchant, currentAuth, requestedTotal, reason"
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Step A: Fetch History (The Memory)
    // ═══════════════════════════════════════════════════════════════
    runtime.log("[Step A] Fetching transaction history...");

    const transactionHistory: TransactionHistoryItem[] = getRecentTransactions(
      runtime,
      riskPayload.user,
      riskPayload.merchant
    );

    // Format history for LLM prompt
    const historyString = transactionHistory.length > 0
      ? `Recent transactions between ${riskPayload.user} and ${riskPayload.merchant}: [${transactionHistory.map(tx => `$${tx.amount}`).join(', ')}]`
      : `No transaction history found between ${riskPayload.user} and ${riskPayload.merchant}`;

    runtime.log(`[Step A] Transaction History: ${historyString}`);

    // ═══════════════════════════════════════════════════════════════
    // Step B & C: Dynamic Prompting + LLM Decision (The Brain)
    // ═══════════════════════════════════════════════════════════════
    runtime.log("[Step B] Constructing dynamic prompt based on merchant type...");
    runtime.log(`[Step C] Querying Gemini AI for risk assessment...`);

    const riskAssessmentDetails = {
      merchantType: riskPayload.merchantType,
      userAddress: riskPayload.user,
      merchantAddress: riskPayload.merchant,
      currentAuth: riskPayload.currentAuth,
      requestedTotal: riskPayload.requestedTotal,
      reason: riskPayload.reason,
      transactionHistory: historyString,
    };

    geminiResponse = assessPaymentRisk(runtime, riskAssessmentDetails);
    runtime.log(`[Step C] AI Risk Assessment Complete. Status: ${geminiResponse.statusCode}`);
    runtime.log(`[Step C] Gemini Response: ${geminiResponse.geminiResponse}`);

    // Parse and validate the Gemini response
    let llmResult: LLMResult;
    try {
      const parsedResponse = JSON.parse(geminiResponse.geminiResponse);
      llmResult = GeminiResponseSchema.parse(parsedResponse);
    } catch (parseError) {
      runtime.log(`[ERROR] Failed to parse Gemini response: ${parseError}`);
      throw new Error("Invalid AI response format");
    }

    runtime.log(`[Step C] AI Decision: ${llmResult.result} (confidence: ${llmResult.confidence}/10000)`);
    if (llmResult.reasoning) {
      runtime.log(`[Step C] AI Reasoning: ${llmResult.reasoning}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // Step D: On-Chain Action Based on AI Decision
    // ═══════════════════════════════════════════════════════════════
    if (llmResult.result === "YES") {
      runtime.log("[Step D] AI APPROVED - Executing on-chain transaction...");
      txHash = executeSecureIncrement(runtime, riskPayload);
      runtime.log(`[Step D] ✓ Transaction executed successfully: ${txHash}`);
    } else {
      runtime.log("[Step D] AI REJECTED - No on-chain action taken");
      runtime.log(`[Step D] Rejection reasoning: ${llmResult.reasoning || "Risk assessment failed"}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // Step E: Write Log for Future Context
    // ═══════════════════════════════════════════════════════════════
    runtime.log("[Step E] Writing risk assessment log to Firestore...");

    const logResult: FirestoreWriteResponse = writeRiskAssessmentLog(
      runtime,
      riskPayload,
      geminiResponse,
      txHash
    );

    runtime.log(`[Step E] Assessment logged: ${logResult.name}`);

    // ═══════════════════════════════════════════════════════════════
    // Step 6: Return appropriate response
    // ═══════════════════════════════════════════════════════════════
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (llmResult.result === "YES") {
      return JSON.stringify({
        status: "approved",
        message: "Payment adjustment approved by AI Risk Engine",
        txHash: txHash,
        confidence: llmResult.confidence,
        reasoning: llmResult.reasoning
      });
    } else {
      // Return 403 Forbidden equivalent for rejected requests
      return JSON.stringify({
        status: "rejected",
        message: "Payment adjustment rejected by AI Risk Engine",
        confidence: llmResult.confidence,
        reasoning: llmResult.reasoning
      });
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] Risk assessment failed: ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Still log the attempt even if it failed (if we have the required data)
    if (riskPayload && geminiResponse) {
      try {
        writeRiskAssessmentLog(runtime, riskPayload, geminiResponse, "");
      } catch (logError) {
        runtime.log(`[WARNING] Failed to log error case: ${logError}`);
      }
    }

    return JSON.stringify({
      status: "error",
      message: `Risk assessment failed: ${msg}`
    });
  }
};

/**
 * Executes the secureIncrement function on the AegisProtocol smart contract.
 * Encodes the transaction data and submits it via CRE's writeReport capability.
 * 
 * @param runtime - CRE runtime instance
 * @param payload - Risk assessment payload containing transaction details
 * @returns Transaction hash of the successful execution
 */
function executeSecureIncrement(runtime: Runtime<Config>, payload: RiskAssessmentPayload): string {
  // Get EVM configuration
  const evmConfig = runtime.config.evmConfigs[0];
  if (!evmConfig) {
    throw new Error("No EVM configuration found");
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
  }

  runtime.log(`[On-chain] Target chain: ${evmConfig.chainSelectorName}`);
  runtime.log(`[On-chain] AegisProtocol address: ${evmConfig.contractAddress}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Encode the secureIncrement call data
  const reportData = encodeAbiParameters(
    SECURE_INCREMENT_PARAMS,
    [
      payload.user as `0x${string}`,
      payload.merchant as `0x${string}`,
      BigInt(payload.requestedTotal),
      payload.reason
    ]
  );

  // Generate a signed CRE report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  // Write the report to the smart contract
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: evmConfig.contractAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: evmConfig.gasLimit || "2000000",
      },
    })
    .result();

  // Check execution result
  if (writeResult.txStatus === TxStatus.SUCCESS) {
    return bytesToHex(writeResult.txHash || new Uint8Array(32));
  }

  throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
}

/*********************************
 * Workflow Initialization
 *********************************/

const initWorkflow = (config: Config) => {
  // Validate configuration against schema
  const validatedConfig = configSchema.parse(config);

  // Initialize HTTP capability for risk assessment requests
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  return [
    // HTTP Trigger - Aegis AI Risk Engine
    cre.handler(httpTrigger, onHttpTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
