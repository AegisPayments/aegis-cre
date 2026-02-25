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
 * Schema for the main workflow configuration file (config.json).
 * Validates Gemini model name and array of EVM configurations.
 */
export const configSchema = z.object({
    geminiModel: z.string(),
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
 * Expected HTTP payload for risk assessment requests.
 */
export interface RiskAssessmentPayload {
    merchantType: MerchantType;
    user: string; // User wallet address (0x...)
    merchant: string; // Merchant wallet address (0x...)
    currentAuth: number; // Current authorized amount
    requestedTotal: number; // New requested total amount
    reason: string; // Reason for the adjustment
}

/**
 * Transaction history item for risk assessment context.
 */
export interface TransactionHistoryItem {
    amount: number;
    timestamp: number;
    merchant: string;
    user: string;
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
 * Gemini API Types
 *********************************/

/**
 * Response from the Gemini API HTTP request.
 * Contains both the parsed result and raw response data.
 */
export type GeminiResponse = {
    statusCode: number;
    geminiResponse: string; // Parsed JSON string from Gemini
    responseId: string; // Unique identifier for this request
    rawJsonString: string; // Full raw response body
};

/**
 * Schema for validating Gemini's JSON response format.
 * Ensures the model returns a valid risk assessment decision.
 */
export const GeminiResponseSchema = z.object({
    result: z.enum(["YES", "NO"]),
    confidence: z.number().int().min(0).max(10_000, "confidence must be between 0 and 10000 inclusive"),
    reasoning: z.string().optional(), // Optional reasoning for the decision
});

/** Validated LLM result type. */
export type LLMResult = z.infer<typeof GeminiResponseSchema>;

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
 * Firestore document write payload structure for transaction history.
 * All fields must follow Firestore's typed field format.
 */
export interface FirestoreTransactionData {
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
        timestamp: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        merchantType: {
            stringValue: string;
        };
        reason: {
            stringValue: string;
        };
    };
}

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
        riskDecision: {
            stringValue: string;
        };
        confidence: {
            integerValue: number;
        };
        txHash: {
            stringValue: string;
        };
        geminiResponse: {
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