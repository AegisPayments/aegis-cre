// captured-funds.ts
// CRE callback for handling Captured event logs from the Aegis protocol contract.
// Writes captured fund events to Firestore for audit trail and analytics.

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import { Config, CapturedEventLog } from "../../types";
import { writeCapturedLog } from "../../firebase";

/** ABI for the Captured event that CRE listens for. */
const eventAbi = parseAbi(["event Captured(address indexed user, address indexed merchant, uint256 amount)"]);

/**
 * Handles Captured event logs from the Aegis protocol contract.
 * Parses the event data and writes it to Firestore for audit trail.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param log - EVM log containing the Captured event
 * @returns Success message string
 */
export const onCapturedLog = (runtime: Runtime<Config>, log: EVMLog): string => {
    try {
        runtime.log("Processing Captured event log");

        // ========================================
        // Step 1: Decode Event Log
        // ========================================

        // Convert topics/data to hex for viem decoding
        const topics = log.topics.map(t => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]];
        const data = bytesToHex(log.data);

        // Decode event fields using the ABI
        const decodedLog = decodeEventLog({ abi: eventAbi, data, topics });
        runtime.log(`Event name: ${decodedLog.eventName}`);

        const user: string = decodedLog.args.user as string;
        const merchant: string = decodedLog.args.merchant as string;
        const amount: bigint = decodedLog.args.amount as bigint;

        runtime.log(`Captured event: user=${user}, merchant=${merchant}, amount=${amount.toString()}`);

        // ========================================
        // Step 2: Create Event Log Data
        // ========================================

        const eventLog: CapturedEventLog = {
            user,
            merchant,
            amount,
            blockNumber: bytesToHex(log.blockNumber?.absVal || new Uint8Array()),
            transactionHash: bytesToHex(log?.txHash || new Uint8Array()),
            logIndex: 0, // Log index not available in EVMLog type
        };

        // ========================================
        // Step 3: Write to Firestore
        // ========================================

        const firestoreResult = writeCapturedLog(runtime, eventLog);
        runtime.log(`Captured log written to Firestore: ${firestoreResult.name}`);

        return "Captured event processed successfully";
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`onCapturedLog error: ${msg}`);
        throw err;
    }
};