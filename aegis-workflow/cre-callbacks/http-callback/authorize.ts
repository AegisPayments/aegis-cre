// Authorize handler - Handles payment authorization requests with signature verification
// Handles the authorize functionality with the 0x01 prefix byte

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
    type AuthorizePayload,
    type FirestoreWriteResponse,
    type LLMResponse,
    type LLMResult,
    type FraudAssessmentDetails,
    type TransactionHistoryItem,
    LLMResponseSchema,
} from "../../types";
import { writeAuthorizeLog, getRecentTransactions } from "../../firebase";
import { assessFraudRisk } from "../../llm";

// ABI parameters for authorize function with prefix
const AUTHORIZE_PARAMS = parseAbiParameters("address user, address merchant, uint256 amount, uint256 nonce, bytes signature");

/**
 * Handles authorize requests - Payment authorization with cryptographic signature verification.
 * Includes AI-powered fraud detection and logs to Firestore for audit trail.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param inputString - JSON string containing the authorize request
 * @returns Success message or error response
 */
export const handleAuthorize = (runtime: Runtime<Config>, inputString: string): string => {
    runtime.log("───────────────────────────────────────────────────");
    runtime.log("Aegis Protocol: authorize Processing");
    runtime.log("───────────────────────────────────────────────────");

    let txHash = ""; // Will be populated if transaction is executed
    let authorizePayload: AuthorizePayload | undefined;
    let fraudResponse: LLMResponse | undefined;

    try {
        // ═══════════════════════════════════════════════════════════════
        // Step 1: Parse and validate the authorize request
        // ═══════════════════════════════════════════════════════════════
        authorizePayload = JSON.parse(inputString) as AuthorizePayload;
        runtime.log(`[Step 1] Authorize Request:`);
        runtime.log(`  Merchant Type: ${authorizePayload.merchantType}`);
        runtime.log(`  User: ${authorizePayload.user}`);
        runtime.log(`  Merchant: ${authorizePayload.merchant}`);
        runtime.log(`  Amount: $${authorizePayload.amount}`);
        runtime.log(`  Nonce: ${authorizePayload.nonce}`);
        runtime.log(`  Signature: ${authorizePayload.signature.substring(0, 20)}...`);

        // Validate required fields for authorize
        if (!authorizePayload.merchantType || !authorizePayload.user || !authorizePayload.merchant ||
            authorizePayload.amount === undefined || authorizePayload.nonce === undefined ||
            !authorizePayload.signature) {
            runtime.log("[ERROR] Missing required fields in authorize request");
            return JSON.stringify({
                status: "error",
                message: "Missing required fields: merchantType, user, merchant, amount, nonce, signature"
            });
        }

        // Basic validation
        if (authorizePayload.amount <= 0) {
            runtime.log("[ERROR] Amount must be greater than 0");
            return JSON.stringify({
                status: "error",
                message: "Amount must be greater than 0"
            });
        }

        if (!authorizePayload.signature.startsWith('0x')) {
            runtime.log("[ERROR] Invalid signature format - must be 0x-prefixed");
            return JSON.stringify({
                status: "error",
                message: "Invalid signature format"
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // Step 2: AI-Powered Fraud Detection
        // ═══════════════════════════════════════════════════════════════
        runtime.log("[Step 2] Running AI fraud detection...");

        // Fetch transaction history for fraud analysis context
        const transactionHistory: TransactionHistoryItem[] = getRecentTransactions(
            runtime,
            authorizePayload.user,
            authorizePayload.merchant,
            "auth"
        );

        const historyString = transactionHistory.length > 0
            ? `Recent transactions between ${authorizePayload.user} and ${authorizePayload.merchant}: [${transactionHistory.map(tx => `$${tx.amount} (${tx.decision}, ${tx.merchantType})`).join(', ')}]`
            : `No transaction history found between ${authorizePayload.user} and ${authorizePayload.merchant}`;

        runtime.log(`[Step 2] Transaction History: ${historyString}`);

        const fraudAssessmentDetails: FraudAssessmentDetails = {
            userAddress: authorizePayload.user,
            merchantAddress: authorizePayload.merchant,
            amount: authorizePayload.amount,
            nonce: authorizePayload.nonce,
            signature: authorizePayload.signature,
            transactionHistory: historyString,
        };

        fraudResponse = assessFraudRisk(runtime, fraudAssessmentDetails);
        runtime.log(`[Step 2] AI Fraud Assessment Complete. Status: ${fraudResponse.statusCode}`);
        runtime.log(`[Step 2] LLM Response: ${fraudResponse.llmResponse}`);

        // Parse and validate the LLM response
        let fraudResult: LLMResult;
        try {
            fraudResult = LLMResponseSchema.parse(JSON.parse(fraudResponse.llmResponse));
        } catch (parseError) {
            runtime.log(`[ERROR] Failed to parse LLM fraud response: ${parseError}`);
            throw new Error("Invalid LLM fraud response format");
        }

        runtime.log(`[Step 2] AI Fraud Decision: ${fraudResult.result} (confidence: ${fraudResult.confidence}/10000)`);
        if (fraudResult.reasoning) {
            runtime.log(`[Step 2] Reasoning: ${fraudResult.reasoning}`);
        }

        // Block transaction if fraud detected
        if (fraudResult.result === "NO") {
            runtime.log(`[Step 2] ❌ Transaction blocked due to fraud detection`);

            // Log the rejected authorization to Firestore for audit trail
            runtime.log("[Step 2] Writing rejected authorization log to Firestore...");
            try {
                writeAuthorizeLog(runtime, authorizePayload, "", "NO", fraudResult.confidence);
            } catch (logError) {
                runtime.log(`[WARNING] Failed to log rejected authorization: ${logError}`);
            }

            return JSON.stringify({
                status: "fraud_detected",
                message: "Transaction blocked due to fraud detection",
                functionName: "authorize",
                confidence: fraudResult.confidence,
                reasoning: fraudResult.reasoning || "AI fraud detection triggered"
            });
        }

        runtime.log(`[Step 2] ✓ Fraud check passed, proceeding with authorization`);

        // ═══════════════════════════════════════════════════════════════
        // Step 3: Execute On-Chain Authorization
        // ═══════════════════════════════════════════════════════════════
        runtime.log("[Step 3] Executing authorize on-chain...");

        txHash = executeAuthorize(runtime, authorizePayload);
        runtime.log(`[Step 3] ✓ authorize transaction executed: ${txHash}`);

        // ═══════════════════════════════════════════════════════════════
        // Step 4: Log Authorization for Audit Trail
        // ═══════════════════════════════════════════════════════════════
        runtime.log("[Step 4] Writing authorization log to Firestore...");

        const logResult: FirestoreWriteResponse = writeAuthorizeLog(
            runtime,
            authorizePayload,
            txHash,
            "YES",
            fraudResult.confidence
        );

        runtime.log(`[Step 4] Authorization logged: ${logResult.name}`);

        // ═══════════════════════════════════════════════════════════════
        // Step 5: Return Success Response
        // ═══════════════════════════════════════════════════════════════
        runtime.log("───────────────────────────────────────────────────");

        return JSON.stringify({
            status: "authorized",
            message: "Payment authorization processed successfully with AI fraud protection",
            functionName: "authorize",
            txHash: txHash,
            user: authorizePayload.user,
            merchant: authorizePayload.merchant,
            amount: authorizePayload.amount,
            nonce: authorizePayload.nonce,
            fraudConfidence: fraudResult?.confidence,
            fraudReasoning: fraudResult?.reasoning
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[ERROR] authorize processing failed: ${msg}`);
        runtime.log("───────────────────────────────────────────────────");

        // Still log the attempt even if it failed (if we have the required data)
        if (authorizePayload) {
            try {
                writeAuthorizeLog(runtime, authorizePayload, "", "ERROR", 0);
            } catch (logError) {
                runtime.log(`[WARNING] Failed to log error case: ${logError}`);
            }
        }

        // Log fraud assessment if available
        if (fraudResponse) {
            runtime.log(`[INFO] Fraud assessment was completed before failure: ${fraudResponse.llmResponse}`);
        }

        return JSON.stringify({
            status: "error",
            message: `authorize processing failed: ${msg}`,
            functionName: "authorize"
        });
    }
};

/**
 * Executes the authorize function on the AegisProtocol smart contract.
 * Encodes the transaction data with 0x01 prefix and submits it via CRE's writeReport capability.
 * The smart contract will verify the signature and perform the authorization.
 * 
 * @param runtime - CRE runtime instance
 * @param payload - Authorize payload containing transaction details and signature
 * @returns Transaction hash of the successful execution
 */
function executeAuthorize(runtime: Runtime<Config>, payload: AuthorizePayload): string {
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

    // Encode the authorize call data
    const reportData = encodeAbiParameters(
        AUTHORIZE_PARAMS,
        [
            payload.user as `0x${string}`,
            payload.merchant as `0x${string}`,
            BigInt(payload.amount),
            BigInt(payload.nonce),
            payload.signature as `0x${string}`
        ]
    );

    // Prepend 0x01 prefix for authorize routing in the smart contract
    const prefixedData = `0x01${reportData.slice(2)}` as `0x${string}`;

    runtime.log(`[On-chain] Encoded data with 0x01 prefix: ${prefixedData}`);

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
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
        runtime.log(`Transaction successful: ${txHash}`)
        return txHash
    }

    throw new Error(`authorize transaction failed with status: ${writeResult.txStatus}`);
}