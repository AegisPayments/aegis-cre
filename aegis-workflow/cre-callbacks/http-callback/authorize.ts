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
} from "../../types";
import { writeAuthorizeLog } from "../../firebase";

// ABI parameters for authorize function with prefix
const AUTHORIZE_PARAMS = parseAbiParameters("address user, address merchant, uint256 amount, uint256 nonce, bytes signature");

/**
 * Handles authorize requests - Payment authorization with cryptographic signature verification.
 * Currently logs to Firestore for audit trail. Future enhancement will include AI fraud detection.
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

    try {
        // ═══════════════════════════════════════════════════════════════
        // Step 1: Parse and validate the authorize request
        // ═══════════════════════════════════════════════════════════════
        authorizePayload = JSON.parse(inputString) as AuthorizePayload;
        runtime.log(`[Step 1] Authorize Request:`);
        runtime.log(`  User: ${authorizePayload.user}`);
        runtime.log(`  Merchant: ${authorizePayload.merchant}`);
        runtime.log(`  Amount: $${authorizePayload.amount}`);
        runtime.log(`  Nonce: ${authorizePayload.nonce}`);
        runtime.log(`  Signature: ${authorizePayload.signature.substring(0, 20)}...`);

        // Validate required fields for authorize
        if (!authorizePayload.user || !authorizePayload.merchant ||
            authorizePayload.amount === undefined || authorizePayload.nonce === undefined ||
            !authorizePayload.signature) {
            runtime.log("[ERROR] Missing required fields in authorize request");
            return JSON.stringify({
                status: "error",
                message: "Missing required fields: user, merchant, amount, nonce, signature"
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
        // Step 2: Execute On-Chain Authorization
        // ═══════════════════════════════════════════════════════════════
        runtime.log("[Step 2] Executing authorize on-chain...");

        txHash = executeAuthorize(runtime, authorizePayload);
        runtime.log(`[Step 2] ✓ authorize transaction executed: ${txHash}`);

        // ═══════════════════════════════════════════════════════════════
        // Step 3: Log Authorization for Audit Trail
        // ═══════════════════════════════════════════════════════════════
        runtime.log("[Step 3] Writing authorization log to Firestore...");

        const logResult: FirestoreWriteResponse = writeAuthorizeLog(
            runtime,
            authorizePayload,
            txHash
        );

        runtime.log(`[Step 3] Authorization logged: ${logResult.name}`);

        // ═══════════════════════════════════════════════════════════════
        // Step 4: Return Success Response
        // ═══════════════════════════════════════════════════════════════
        runtime.log("───────────────────────────────────────────────────");

        return JSON.stringify({
            status: "authorized",
            message: "Payment authorization processed successfully",
            functionName: "authorize",
            txHash: txHash,
            user: authorizePayload.user,
            merchant: authorizePayload.merchant,
            amount: authorizePayload.amount,
            nonce: authorizePayload.nonce
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[ERROR] authorize processing failed: ${msg}`);
        runtime.log("───────────────────────────────────────────────────");

        // Still log the attempt even if it failed (if we have the required data)
        if (authorizePayload) {
            try {
                writeAuthorizeLog(runtime, authorizePayload, "");
            } catch (logError) {
                runtime.log(`[WARNING] Failed to log error case: ${logError}`);
            }
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
        return bytesToHex(writeResult.txHash || new Uint8Array(32));
    }

    throw new Error(`authorize transaction failed with status: ${writeResult.txStatus}`);
}