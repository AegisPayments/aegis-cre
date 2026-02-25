// HTTP trigger handler that routes between different payment functions
// Handles routing between authorize and secureIncrement functions based on functionName parameter

import {
    type Runtime,
    type HTTPPayload,
    decodeJson
} from "@chainlink/cre-sdk";
import { type Config, type BasePayload } from "../../types";
import { handleSecureIncrement } from "./secure-increment";
import { handleAuthorize } from "./authorize";

/**
 * Main HTTP trigger handler that routes requests between different payment functions.
 * Routes based on the functionName parameter in the payload.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param payload - HTTP payload containing functionName and function-specific data
 * @returns Success message or error response
 */
export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("Aegis Protocol: Payment Function Router");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        // ═══════════════════════════════════════════════════════════════
        // Step 1: Parse and validate the incoming request payload
        // ═══════════════════════════════════════════════════════════════
        if (!payload.input || payload.input.length === 0) {
            runtime.log("[ERROR] Empty request payload");
            return JSON.stringify({
                status: "error",
                message: "Empty request payload"
            });
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

        const basePayload = JSON.parse(inputString) as BasePayload;
        runtime.log(`[Step 1] Function Router - Processing: ${basePayload.functionName}`);

        // Validate that functionName is provided
        if (!basePayload.functionName) {
            runtime.log("[ERROR] Missing functionName in request payload");
            return JSON.stringify({
                status: "error",
                message: "Missing required field: functionName"
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // Step 2: Route to appropriate function handler
        // ═══════════════════════════════════════════════════════════════
        runtime.log(`[Step 2] Routing to function: ${basePayload.functionName}`);

        switch (basePayload.functionName) {
            case "secureIncrement":
                return handleSecureIncrement(runtime, inputString);

            case "authorize":
                return handleAuthorize(runtime, inputString);

            default:
                runtime.log(`[ERROR] Unknown function: ${basePayload.functionName}`);
                return JSON.stringify({
                    status: "error",
                    message: `Unknown function: ${basePayload.functionName}. Supported functions: secureIncrement, authorize`
                });
        }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[ERROR] HTTP trigger routing failed: ${msg}`);
        runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        return JSON.stringify({
            status: "error",
            message: `Request routing failed: ${msg}`
        });
    }
};