// firebase.ts
// Firebase/Firestore integration for Aegis AI Risk Engine.
// Handles transaction history retrieval and risk assessment logging.
// Uses CRE HTTP capability to interact with Firebase REST APIs.

import { cre, ok, type Runtime, type HTTPSendRequester, consensusIdenticalAggregation } from "@chainlink/cre-sdk";
import type {
    Config,
    TransactionHistoryItem,
    RiskAssessmentPayload,
    AuthorizePayload,
    LLMResponse,
    FirestoreRiskLogData,
    FirestoreAuthorizeLogData,
    FirestoreWriteResponse,
    FirestoreQueryResponse,
    SignupNewUserResponse,
} from "./types";

/*********************************
 * Firebase/Firestore Integration
 *********************************/

/**
 * Retrieves recent transaction history for a user-merchant pair from Firestore.
 * Used to provide context for risk assessment decisions.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param userAddress - User wallet address
 * @param merchantAddress - Merchant wallet address
 * @returns Array of recent transaction history items (up to 5)
 */
export function getRecentTransactions(
    runtime: Runtime<Config>,
    userAddress: string,
    merchantAddress: string
): TransactionHistoryItem[] {
    try {
        const firestoreApiKey = runtime.getSecret({ id: "FIREBASE_API_KEY" }).result();
        const firestoreProjectId = runtime.getSecret({ id: "FIREBASE_PROJECT_ID" }).result();

        const httpClient = new cre.capabilities.HTTPClient();

        // Obtain an ID token via Firebase anonymous authentication
        const tokenResult: SignupNewUserResponse = httpClient
            .sendRequest(
                runtime,
                postFirebaseIdToken(firestoreApiKey.value),
                consensusIdenticalAggregation<SignupNewUserResponse>()
            )(runtime.config)
            .result();

        // Query Firestore for recent transactions
        const queryResult: FirestoreQueryResponse = httpClient
            .sendRequest(
                runtime,
                queryTransactionHistory(tokenResult.idToken, firestoreProjectId.value, userAddress, merchantAddress),
                consensusIdenticalAggregation<FirestoreQueryResponse>()
            )(runtime.config)
            .result();

        // Transform Firestore response to TransactionHistoryItem array
        const transactions: TransactionHistoryItem[] = [];

        if (queryResult.documents) {
            for (const doc of queryResult.documents) {
                transactions.push({
                    amount: parseInt(doc.fields.amount.integerValue),
                    timestamp: parseInt(doc.fields.timestamp.integerValue),
                    merchant: doc.fields.merchantAddress.stringValue,
                    user: doc.fields.userAddress.stringValue,
                });
            }
        }

        // Sort by timestamp descending and take last 5
        return transactions
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);
    } catch (error) {
        // Handle simulation mode or missing secrets by returning mock data
        runtime.log("[SIMULATION] Using mock transaction history data");
        return [
            { amount: 15, timestamp: Date.now() - 86400000, merchant: merchantAddress, user: userAddress },
            { amount: 22, timestamp: Date.now() - 172800000, merchant: merchantAddress, user: userAddress },
            { amount: 18, timestamp: Date.now() - 259200000, merchant: merchantAddress, user: userAddress }
        ];
    }
}

/**
 * Writes risk assessment log to Firestore for audit trail and future context.
 * Records the decision, confidence, and transaction details for each assessment.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param payload - Original risk assessment request payload
 * @param llmResponse - LLM API response containing the decision
 * @param txHash - Transaction hash if the decision was approved and executed
 * @returns Firestore write response with document metadata
 */
export function writeRiskAssessmentLog(
    runtime: Runtime<Config>,
    payload: RiskAssessmentPayload,
    llmResponse: LLMResponse,
    txHash: string
): FirestoreWriteResponse {
    try {
        const firestoreApiKey = runtime.getSecret({ id: "FIREBASE_API_KEY" }).result();
        const firestoreProjectId = runtime.getSecret({ id: "FIREBASE_PROJECT_ID" }).result();

        const httpClient = new cre.capabilities.HTTPClient();

        // Obtain an ID token via Firebase anonymous authentication
        const tokenResult: SignupNewUserResponse = httpClient
            .sendRequest(
                runtime,
                postFirebaseIdToken(firestoreApiKey.value),
                consensusIdenticalAggregation<SignupNewUserResponse>()
            )(runtime.config)
            .result();

        // Write risk assessment log to Firestore
        const writeResult: FirestoreWriteResponse = httpClient
            .sendRequest(
                runtime,
                postRiskAssessmentLog(tokenResult.idToken, firestoreProjectId.value, payload, llmResponse, txHash),
                consensusIdenticalAggregation<FirestoreWriteResponse>()
            )(runtime.config)
            .result();

        return writeResult;
    } catch (error) {
        // Handle simulation mode or missing secrets with mock response
        runtime.log("[SIMULATION] Using mock Firestore write response");
        const now = Date.now();
        return {
            name: `projects/mock-project/databases/(default)/documents/risk-assessments/${now}_${payload.user.slice(-8)}`,
            fields: {},
            createTime: new Date(now).toISOString(),
            updateTime: new Date(now).toISOString(),
        };
    }
}

/**
 * Writes authorization log to Firestore for audit trail.
 * Records the authorization details and transaction hash for each authorize call.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param payload - Original authorize request payload
 * @param txHash - Transaction hash from the authorize execution
 * @returns Firestore write response with document metadata
 */
export function writeAuthorizeLog(
    runtime: Runtime<Config>,
    payload: AuthorizePayload,
    txHash: string
): FirestoreWriteResponse {
    try {
        const firestoreApiKey = runtime.getSecret({ id: "FIREBASE_API_KEY" }).result();
        const firestoreProjectId = runtime.getSecret({ id: "FIREBASE_PROJECT_ID" }).result();

        const httpClient = new cre.capabilities.HTTPClient();

        // Obtain an ID token via Firebase anonymous authentication
        const tokenResult: SignupNewUserResponse = httpClient
            .sendRequest(
                runtime,
                postFirebaseIdToken(firestoreApiKey.value),
                consensusIdenticalAggregation<SignupNewUserResponse>()
            )(runtime.config)
            .result();

        // Write authorization log to Firestore
        const writeResult: FirestoreWriteResponse = httpClient
            .sendRequest(
                runtime,
                postAuthorizeLog(tokenResult.idToken, firestoreProjectId.value, payload, txHash),
                consensusIdenticalAggregation<FirestoreWriteResponse>()
            )(runtime.config)
            .result();

        return writeResult;
    } catch (error) {
        runtime.log(`Error writing authorize log: ${error}`);
        // Handle simulation mode or missing secrets with mock response
        runtime.log("[SIMULATION] Using mock Firestore write response for authorize log");
        const now = Date.now();
        return {
            name: `projects/mock-project/databases/(default)/documents/authorization-logs/${now}_${payload.user.slice(-8)}`,
            fields: {},
            createTime: new Date(now).toISOString(),
            updateTime: new Date(now).toISOString(),
        };
    }
}

/**
 * Obtains a Firebase ID token using anonymous authentication.
 * This token is required for Firestore API requests.
 *
 * @param firebaseApiKey - Firebase Web API key
 * @returns Function that performs the HTTP request and returns the auth response
 */
const postFirebaseIdToken =
    (firebaseApiKey: string) =>
        (sendRequester: HTTPSendRequester, config: Config): SignupNewUserResponse => {
            const dataToSend = {
                returnSecureToken: true,
            };

            const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
            const body = Buffer.from(bodyBytes).toString("base64");

            const req = {
                url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
                method: "POST" as const,
                body: body,
                headers: {
                    "Content-Type": "application/json",
                },
                cacheSettings: {
                    // store: true,
                    // maxAge: "60s",
                    readFromCache: true,
                    maxAgeMs: 60_000,
                },
            };

            const resp = sendRequester.sendRequest(req).result();
            if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}`);

            const bodyText = new TextDecoder().decode(resp.body);
            const externalResp = JSON.parse(bodyText) as SignupNewUserResponse;

            return externalResp;
        };

/**
 * Queries Firestore for transaction history between a user and merchant.
 * Limited to recent transactions to provide context for risk assessment.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param userAddress - User wallet address to filter by
 * @param merchantAddress - Merchant wallet address to filter by
 * @returns Function that performs the HTTP request and returns the query response
 */
const queryTransactionHistory =
    (idToken: string, projectId: string, userAddress: string, merchantAddress: string) =>
        (sendRequester: HTTPSendRequester, config: Config): FirestoreQueryResponse => {
            // Note: This is a simplified query. In production, you might want to use
            // Firestore's structured query API or composite indexes for more complex filtering
            const req = {
                url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/transactions?orderBy=timestamp%20desc&pageSize=10`,
                method: "GET" as const,
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json",
                },
                cacheSettings: {
                    // store: false, // Always fetch fresh transaction data
                    // maxAge: "0s",
                    readFromCache: false,
                    maxAgeMs: 0,
                },
            };

            const resp = sendRequester.sendRequest(req).result();
            if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}`);

            const bodyText = new TextDecoder().decode(resp.body);
            const queryResponse = JSON.parse(bodyText) as FirestoreQueryResponse;

            // Filter results to match user-merchant pair
            if (queryResponse.documents) {
                queryResponse.documents = queryResponse.documents.filter(doc =>
                    doc.fields.userAddress.stringValue === userAddress &&
                    doc.fields.merchantAddress.stringValue === merchantAddress
                );
            }

            return queryResponse;
        };

/**
 * Writes a risk assessment log document to Firestore.
 * Uses a combination of timestamp and user address for document ID uniqueness.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param payload - Risk assessment request payload
 * @param llmResponse - LLM API response
 * @param txHash - Transaction hash (empty if rejected)
 * @returns Function that performs the HTTP request and returns the Firestore response
 */
const postRiskAssessmentLog =
    (idToken: string, projectId: string, payload: RiskAssessmentPayload, llmResponse: LLMResponse, txHash: string) =>
        (sendRequester: HTTPSendRequester, config: Config): FirestoreWriteResponse => {
            const now = Date.now();

            // Parse Gemini response to extract decision details
            let riskDecision = "ERROR";
            let confidence = 0;

            try {
                const parsedResponse = JSON.parse(llmResponse.llmResponse);
                riskDecision = parsedResponse.result || "ERROR";
                confidence = parsedResponse.confidence || 0;
            } catch (e) {
                // Keep defaults if parsing fails
            }

            const dataToSend: FirestoreRiskLogData = {
                fields: {
                    userAddress: { stringValue: payload.user },
                    merchantAddress: { stringValue: payload.merchant },
                    merchantType: { stringValue: payload.merchantType },
                    currentAuth: { integerValue: payload.currentAuth },
                    requestedTotal: { integerValue: payload.requestedTotal },
                    reason: { stringValue: payload.reason },
                    riskDecision: { stringValue: riskDecision },
                    confidence: { integerValue: confidence },
                    txHash: { stringValue: txHash },
                    llmResponse: { stringValue: llmResponse.llmResponse },
                    responseId: { stringValue: llmResponse.responseId },
                    rawJsonString: { stringValue: llmResponse.rawJsonString },
                    createdAt: { integerValue: now },
                },
            };

            const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
            const body = Buffer.from(bodyBytes).toString("base64");

            // Use timestamp + user address hash for unique document ID
            const documentId = `${now}_${payload.user.slice(-8)}`;

            const req = {
                url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/risk-assessments/?documentId=${documentId}`,
                method: "POST" as const,
                body: body,
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json",
                },
                cacheSettings: {
                    // store: true,
                    // maxAge: "60s",
                    readFromCache: true,
                    maxAgeMs: 60_000,
                },
            };

            const resp = sendRequester.sendRequest(req).result();
            if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}`);

            const bodyText = new TextDecoder().decode(resp.body);
            const externalResp = JSON.parse(bodyText) as FirestoreWriteResponse;

            return externalResp;
        };

/**
 * Writes an authorization log document to Firestore.
 * Uses a combination of timestamp and user address for document ID uniqueness.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param payload - Authorize request payload
 * @param txHash - Transaction hash from authorization execution
 * @returns Function that performs the HTTP request and returns the Firestore response
 */
const postAuthorizeLog =
    (idToken: string, projectId: string, payload: AuthorizePayload, txHash: string) =>
        (sendRequester: HTTPSendRequester, config: Config): FirestoreWriteResponse => {
            const now = Date.now();

            const dataToSend: FirestoreAuthorizeLogData = {
                fields: {
                    userAddress: { stringValue: payload.user },
                    merchantAddress: { stringValue: payload.merchant },
                    amount: { integerValue: payload.amount },
                    nonce: { integerValue: payload.nonce },
                    signature: { stringValue: payload.signature },
                    txHash: { stringValue: txHash },
                    functionName: { stringValue: payload.functionName },
                    createdAt: { integerValue: now },
                },
            };

            const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
            const body = Buffer.from(bodyBytes).toString("base64");

            // Use timestamp + user address hash for unique document ID
            const documentId = `${now}_${payload.user.slice(-8)}`;

            const req = {
                url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/authorization-logs/?documentId=${documentId}`,
                method: "POST" as const,
                body: body,
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json",
                },
                cacheSettings: {
                    // store: true,
                    // maxAge: "60s",
                    readFromCache: true,
                    maxAgeMs: 60_000,
                },
            };

            const resp = sendRequester.sendRequest(req).result();
            if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}`);

            const bodyText = new TextDecoder().decode(resp.body);
            const externalResp = JSON.parse(bodyText) as FirestoreWriteResponse;

            return externalResp;
        };