// types.ts
// Type definitions and schemas for the Aegis AI Risk Engine workflow.
// Includes configuration validation, Gemini API types, Firestore data structures, and risk assessment types.

import { z } from "zod";

/*********************************
 * Configuration Schemas
 *********************************/

/**
 * Schema for individual EVM chain configuration.
 * Validates chain selector name, Aegis protocol contract address, and gas limit.
 */
const evmConfigSchema = z.object({
    chainSelectorName: z.string().min(1),
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "contractAddress must be a 0x-prefixed 20-byte hex"),
    // Gas limit must be a numeric string (parsed from JSON config)
    gasLimit: z
        .string()
        .regex(/^\d+$/, "gasLimit must be a numeric string")
        .refine(val => Number(val) > 0, { message: "gasLimit must be greater than 0" }),
});

/**
 * Schema for LLM provider configuration.
 * Supports both Gemini and OpenAI providers with flexible URL configuration.
 */
const llmConfigSchema = z.object({
    provider: z.enum(["gemini", "openai"]),
    model: z.string(),
    apiUrl: z.string().min(1), // TODO: later remove this Less strict URL validation and switch to url()
    apiKeyId: z.string(), // Secret ID for the API key
});

/**
 * Schema for the main workflow configuration file (config.json).
 * Validates LLM configuration and array of EVM configurations.
 */
export const configSchema = z.object({
    llm: llmConfigSchema,
    evmConfigs: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
});

/** Type inferred from the validated config schema. */
export type Config = z.infer<typeof configSchema>;

/*********************************
 * Risk Assessment Types
 *********************************/

/**
 * Merchant types that determine risk assessment rules.
 */
export type MerchantType = "EV_CHARGER" | "RETAIL" | "RIDE_SHARE";

/**
 * Query history types to control which collections to query.
 * TODO: This was added to temporily deal with PerWorkflow.HTTPAction.CallLimit quota limit of 5 http calls. Might need to proxy requsets
 */
export type QueryHistoryType = "both" | "auth" | "risk";

/**
 * Fraud detection context for authorization requests.
 */
export interface FraudAssessmentDetails {
    userAddress: string;
    merchantAddress: string;
    amount: number;
    nonce: number;
    signature: string;
    transactionHistory: string;
}

/**
 * Base payload structure for HTTP requests.
 * Contains the functionName for routing to appropriate handlers.
 */
export interface BasePayload {
    functionName: "secureIncrement" | "authorize";
}

/**
 * Expected HTTP payload for risk assessment requests (secureIncrement function).
 */
export interface RiskAssessmentPayload extends BasePayload {
    functionName: "secureIncrement";
    merchantType: MerchantType;
    user: string; // User wallet address (0x...)
    merchant: string; // Merchant wallet address (0x...)
    currentAuth: number; // Current authorized amount. // TODO: query from db. For now should match th value for authorizationLogId in the firestore collection
    requestedTotal: number; // New requested total amount
    reason: string; // Reason for the adjustment
    authorizationLogId: string; // ID of the authorization log being incremented
}

/**
 * Expected HTTP payload for authorization requests (authorize function).
 */
export interface AuthorizePayload extends BasePayload {
    functionName: "authorize";
    merchantType: MerchantType;
    user: string; // User wallet address (0x...)
    merchant: string; // Merchant wallet address (0x...)
    amount: number; // Amount to authorize
    nonce: number; // User's current nonce for replay protection
    signature: string; // User's EIP-712 signature (0x-prefixed)
}

/**
 * Log event data for Captured event.
 */
export interface CapturedEventLog {
    user: string; // User wallet address (0x...)
    merchant: string; // Merchant wallet address (0x...)
    amount: bigint; // Amount captured (as bigint from event)
    blockNumber: string;
    transactionHash: string;
    logIndex: number;
}

/**
 * Log event data for FundsReleased event.
 */
export interface FundsReleasedEventLog {
    user: string; // User wallet address (0x...)
    merchant: string; // Merchant wallet address (0x...)
    amount: bigint; // Amount released (as bigint from event)
    blockNumber: string;
    transactionHash: string;
    logIndex: number;
}

/**
 * Transaction history item for risk assessment context.
 */
export interface TransactionHistoryItem {
    amount: number;
    timestamp: number;
    merchant: string;
    user: string;
    decision: "AUTHORIZED" | "DECLINED" | "INCREMENT_APPROVED" | "INCREMENT_DECLINED";
    merchantType: MerchantType;
}

/**
 * Risk assessment context combining payload and history.
 */
export interface RiskAssessmentContext {
    payload: RiskAssessmentPayload;
    history: TransactionHistoryItem[];
    historyString: string; // Formatted history for LLM prompt
}

/*********************************
 * LLM API Types (Gemini & OpenAI)
 *********************************/

/**
 * Response from the LLM API HTTP request.
 * Contains both the parsed result and raw response data.
 */
export type LLMResponse = {
    statusCode: number;
    llmResponse: string; // Parsed JSON string from LLM
    responseId: string; // Unique identifier for this request
    rawJsonString: string; // Full raw response body
};

/**
 * Schema for validating LLM's JSON response format.
 * Ensures the model returns a valid risk assessment decision.
 */
export const LLMResponseSchema = z.object({
    result: z.enum(["YES", "NO"]),
    confidence: z.number().int().min(0).max(10_000, "confidence must be between 0 and 10000 inclusive"),
    reasoning: z.string().optional(), // Optional reasoning for the decision
});

/** Validated LLM result type. */
export type LLMResult = z.infer<typeof LLMResponseSchema>;

/**
 * Request payload structure for Gemini API.
 * Includes system instructions and user content for risk assessment.
 */
export interface GeminiData {
    system_instruction: {
        parts: { text: string }[];
    };
    contents: {
        parts: { text: string }[];
    }[];
}

/**
 * Request payload structure for OpenAI API.
 */
export interface OpenAIData {
    model: string;
    messages: {
        role: "system" | "user" | "assistant";
        content: string;
    }[];
    response_format?: {
        type: "json_object";
    };
}

/**
 * Response structure from Gemini API.
 * Contains the generated content and a unique response ID.
 */
export interface GeminiApiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
        };
    }[];
    responseId: string;
}

/**
 * Response structure from OpenAI API.
 */
export interface OpenAIApiResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Risk assessment details for LLM prompt construction.
 */
export interface RiskAssessmentDetails {
    merchantType: MerchantType;
    userAddress: string;
    merchantAddress: string;
    currentAuth: number;
    requestedTotal: number;
    reason: string;
    transactionHistory: string;
}

/*********************************
 * Firestore Types
 *********************************/

/**
 * Firestore document write payload structure for risk assessment logs.
 * All fields must follow Firestore's typed field format.
 */
export interface FirestoreRiskLogData {
    fields: {
        userAddress: {
            stringValue: string;
        };
        merchantAddress: {
            stringValue: string;
        };
        merchantType: {
            stringValue: string;
        };
        currentAuth: {
            integerValue: number;
        };
        requestedTotal: {
            integerValue: number;
        };
        reason: {
            stringValue: string;
        };
        authorizationLogId: {
            stringValue: string;
        };
        riskDecision: {
            stringValue: string;
        };
        confidence: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        llmResponse: {
            stringValue: string;
        };
        responseId: {
            stringValue: string;
        };
        rawJsonString: {
            stringValue: string;
        };
        createdAt: {
            integerValue: number;
        };
    };
}

/**
 * Firestore document write payload structure for authorization logs.
 * All fields must follow Firestore's typed field format.
 */
export interface FirestoreAuthorizeLogData {
    fields: {
        userAddress: {
            stringValue: string;
        };
        merchantAddress: {
            stringValue: string;
        };
        merchantType: {
            stringValue: string;
        };
        amount: {
            integerValue: number;
        };
        nonce: {
            integerValue: number;
        };
        signature: {
            stringValue: string;
        };
        fraudDecision: {
            stringValue: string;
        };
        fraudConfidence: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        functionName: {
            stringValue: string;
        };
        createdAt: {
            integerValue: number;
        };
    };
}

/**
 * Firestore document write payload structure for captured funds logs.
 * All fields must follow Firestore's typed field format.
 */
export interface FirestoreCapturedLogData {
    fields: {
        userAddress: {
            stringValue: string;
        };
        merchantAddress: {
            stringValue: string;
        };
        amount: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        blockNumber: {
            stringValue: string;
        };
        transactionHash: {
            stringValue: string;
        };
        logIndex: {
            integerValue: number;
        };
        createdAt: {
            integerValue: number;
        };
    };
}

/**
 * Firestore document write payload structure for funds released logs.
 * All fields must follow Firestore's typed field format.
 */
export interface FirestoreFundsReleasedLogData {
    fields: {
        userAddress: {
            stringValue: string;
        };
        merchantAddress: {
            stringValue: string;
        };
        amount: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        blockNumber: {
            stringValue: string;
        };
        transactionHash: {
            stringValue: string;
        };
        logIndex: {
            integerValue: number;
        };
        createdAt: {
            integerValue: number;
        };
    };
}

/**
 * Response from Firestore document write operation.
 * Contains document metadata and echoes back the written fields.
 */
export interface FirestoreWriteResponse {
    name: string; // Full document path
    fields: {
        [key: string]: {
            stringValue?: string;
            integerValue?: string;
        };
    };
    createTime: string; // ISO 8601 timestamp
    updateTime: string; // ISO 8601 timestamp
}

/**
 * Response from Firestore query operation for transaction history.
 */
export interface FirestoreQueryResponse {
    documents?: Array<{
        name: string;
        fields: {
            amount: { integerValue: string };
            timestamp: { integerValue: string };
            merchantAddress: { stringValue: string };
            userAddress: { stringValue: string };
            [key: string]: any;
        };
        createTime: string;
        updateTime: string;
    }>;
}

/*********************************
 * Firebase Authentication Types
 *********************************/

/**
 * Response from Firebase anonymous sign-up endpoint.
 * Provides an ID token for authenticating Firestore requests.
 */
export interface SignupNewUserResponse {
    kind: string;
    idToken: string; // JWT token for Firestore authentication
    refreshToken: string;
    expiresIn: string; // Token expiration time in seconds
    localId: string; // Anonymous user ID
}