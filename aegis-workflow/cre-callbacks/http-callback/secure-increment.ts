// Secure Increment handler - AI powered risk assessment for payment adjustments
// Handles the secureIncrement functionality with the 0x02 prefix byte

import {
    cre,
    type Runtime,
    bytesToHex,
    hexToBase64,
    TxStatus,
    getNetwork,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import {
    type Config,
    type RiskAssessmentPayload,
    type LLMResponse,
    type FirestoreWriteResponse,
    type TransactionHistoryItem,
    type LLMResult,
    LLMResponseSchema
} from "../../types";
import { assessPaymentRisk } from "../../llm";
import { getRecentTransactions, writeRiskAssessmentLog } from "../../firebase";

// ABI parameters for secureIncrement function with prefix
const SECURE_INCREMENT_PARAMS = parseAbiParameters("address user, address merchant, uint256 requestedTotal, string reason");

/**
 * Handles secureIncrement requests - AI powered risk assessment for payment adjustments.
 * Orchestrates the full assessment flow: History → AI Assessment → On-chain Action → Logging.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param inputString - JSON string containing the risk assessment request
 * @returns Success message or error response
 */
export const handleSecureIncrement = (runtime: Runtime<Config>, inputString: string): string => {
    runtime.log("───────────────────────────────────────────────────");
    runtime.log("Aegis AI Risk Engine: secureIncrement Processing");
    runtime.log("───────────────────────────────────────────────────");

    let txHash = ""; // Will be populated if transaction is executed
    let riskPayload: RiskAssessmentPayload | undefined;
    let llmResponse: LLMResponse | undefined;

    try {
        // ═══════════════════════════════════════════════════════════════
        // Step 1: Parse and validate the risk assessment request
        // ═══════════════════════════════════════════════════════════════
        riskPayload = JSON.parse(inputString) as RiskAssessmentPayload;
        runtime.log(`[Step 1] Risk Assessment Request:`);
        runtime.log(`  Merchant Type: ${riskPayload.merchantType}`);
        runtime.log(`  User: ${riskPayload.user}`);
        runtime.log(`  Merchant: ${riskPayload.merchant}`);
        runtime.log(`  Current Auth: $${riskPayload.currentAuth}`);
        runtime.log(`  Requested Total: $${riskPayload.requestedTotal}`);
        runtime.log(`  Reason: "${riskPayload.reason}"`);

        // Validate required fields for secureIncrement
        if (!riskPayload.merchantType || !riskPayload.user || !riskPayload.merchant ||
            riskPayload.currentAuth === undefined || riskPayload.requestedTotal === undefined || !riskPayload.reason) {
            runtime.log("[ERROR] Missing required fields in secureIncrement request");
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

        llmResponse = assessPaymentRisk(runtime, riskAssessmentDetails);
        runtime.log(`[Step C] AI Risk Assessment Complete. Status: ${llmResponse.statusCode}`);
        runtime.log(`[Step C] LLM Response: ${llmResponse.llmResponse}`);

        // Parse and validate the Gemini response
        let llmResult: LLMResult;
        try {
            const parsedResponse = JSON.parse(llmResponse.llmResponse);
            llmResult = LLMResponseSchema.parse(parsedResponse);
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
            runtime.log("[Step D] AI APPROVED - Executing secureIncrement on-chain...");
            txHash = executeSecureIncrement(runtime, riskPayload);
            runtime.log(`[Step D] ✓ secureIncrement transaction executed: ${txHash}`);
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
            llmResponse,
            txHash
        );

        runtime.log(`[Step E] Assessment logged: ${logResult.name}`);

        // ═══════════════════════════════════════════════════════════════
        // Step 6: Return appropriate response
        // ═══════════════════════════════════════════════════════════════
        runtime.log("───────────────────────────────────────────────────");

        if (llmResult.result === "YES") {
            return JSON.stringify({
                status: "approved",
                message: "Payment adjustment approved by AI Risk Engine",
                functionName: "secureIncrement",
                txHash: txHash,
                confidence: llmResult.confidence,
                reasoning: llmResult.reasoning
            });
        } else {
            return JSON.stringify({
                status: "rejected",
                message: "Payment adjustment rejected by AI Risk Engine",
                functionName: "secureIncrement",
                confidence: llmResult.confidence,
                reasoning: llmResult.reasoning
            });
        }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[ERROR] secureIncrement risk assessment failed: ${msg}`);
        runtime.log("───────────────────────────────────────────────────");

        // Still log the attempt even if it failed (if we have the required data)
        if (riskPayload && llmResponse) {
            try {
                writeRiskAssessmentLog(runtime, riskPayload, llmResponse, "");
            } catch (logError) {
                runtime.log(`[WARNING] Failed to log error case: ${logError}`);
            }
        }

        return JSON.stringify({
            status: "error",
            message: `secureIncrement risk assessment failed: ${msg}`,
            functionName: "secureIncrement"
        });
    }
};

/**
 * Executes the secureIncrement function on the AegisProtocol smart contract.
 * Encodes the transaction data with 0x02 prefix and submits it via CRE's writeReport capability.
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

    // Prepend 0x02 prefix for secureIncrement routing in the smart contract
    const prefixedData = `0x02${reportData.slice(2)}` as `0x${string}`;

    runtime.log(`[On-chain] Encoded data with 0x02 prefix: ${prefixedData}`);

    // Generate a signed CRE report
    const reportResponse = runtime
        .report({
            encodedPayload: hexToBase64(prefixedData),
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

    throw new Error(`secureIncrement transaction failed with status: ${writeResult.txStatus}`);
}