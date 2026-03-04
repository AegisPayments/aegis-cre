// funds-released.ts
// CRE callback for handling FundsReleased event logs from the Aegis protocol contract.
// Writes funds released events to Firestore for audit trail and analytics.

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import { Config, FundsReleasedEventLog } from "../../types";
import { writeFundsReleasedLog } from "../../firebase";

/** ABI for the FundsReleased event that CRE listens for. */
const eventAbi = parseAbi(["event FundsReleased(address indexed user, address indexed merchant, uint256 amount)"]);

/**
 * Handles FundsReleased event logs from the Aegis protocol contract.
 * Parses the event data and writes it to Firestore for audit trail.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param log - EVM log containing the FundsReleased event
 * @returns Success message string
 */
export const onFundsReleasedLog = (runtime: Runtime<Config>, log: EVMLog): string => {
    try {
        runtime.log("Processing FundsReleased event log");

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

        runtime.log(`FundsReleased event: user=${user}, merchant=${merchant}, amount=${amount.toString()}`);

        // ========================================
        // Step 2: Create Event Log Data
        // ========================================

        const eventLog: FundsReleasedEventLog = {
            user,
            merchant,
            amount,
            blockNumber: Number(log.blockNumber || 0n),
            transactionHash: bytesToHex(log.address), // Using contract address as placeholder
            logIndex: 0, // Log index not available in EVMLog type
        };

        // ========================================
        // Step 3: Write to Firestore
        // ========================================

        const firestoreResult = writeFundsReleasedLog(runtime, eventLog);
        runtime.log(`FundsReleased log written to Firestore: ${firestoreResult.name}`);

        return "FundsReleased event processed successfully";
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`onFundsReleasedLog error: ${msg}`);
        throw err;
    }
};