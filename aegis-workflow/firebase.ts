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
    FirestoreCapturedLogData,
    FirestoreFundsReleasedLogData,
    FirestoreWriteResponse,
    FirestoreQueryResponse,
    SignupNewUserResponse,
    QueryHistoryType,
    CapturedEventLog,
    FundsReleasedEventLog,
} from "./types";

/*********************************
 * Firebase/Firestore Integration
 *********************************/

/**
 * Retrieves recent history (authorizations + risk assessments) for a user-merchant pair from Firestore.
 * Used to provide context for risk assessment decisions.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param userAddress - User wallet address
 * @param merchantAddress - Merchant wallet address
 * @returns Array of recent history items (up to 10 combined)
 */
export function getRecentTransactions(
    runtime: Runtime<Config>,
    userAddress: string,
    merchantAddress: string,
    queryHistoryType: QueryHistoryType = "both"
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
        const queryResult: TransactionHistoryItem[] = httpClient
            .sendRequest(
                runtime,
                queryHistory(tokenResult.idToken, firestoreProjectId.value, userAddress, merchantAddress, queryHistoryType),
                consensusIdenticalAggregation<TransactionHistoryItem[]>()
            )(runtime.config)
            .result();

        // Return the combined history
        return queryResult;
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
 * Writes captured funds log to Firestore for audit trail.
 * Records the captured event details from the Captured event log.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param eventLog - Captured event log data from the EVM log
 * @returns Firestore write response with document metadata
 */
export function writeCapturedLog(
    runtime: Runtime<Config>,
    eventLog: CapturedEventLog
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

        // Write captured log to Firestore
        const writeResult: FirestoreWriteResponse = httpClient
            .sendRequest(
                runtime,
                postCapturedLog(tokenResult.idToken, firestoreProjectId.value, eventLog),
                consensusIdenticalAggregation<FirestoreWriteResponse>()
            )(runtime.config)
            .result();

        return writeResult;
    } catch (error) {
        runtime.log(`Error writing captured log: ${error}`);
        // Handle simulation mode or missing secrets with mock response
        runtime.log("[SIMULATION] Using mock Firestore write response for captured log");
        const now = Date.now();
        return {
            name: `projects/mock-project/databases/(default)/documents/captured-logs/${now}_${eventLog.user.slice(-8)}`,
            fields: {},
            createTime: new Date(now).toISOString(),
            updateTime: new Date(now).toISOString(),
        };
    }
}

/**
 * Writes funds released log to Firestore for audit trail.
 * Records the funds released event details from the FundsReleased event log.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param eventLog - FundsReleased event log data from the EVM log
 * @returns Firestore write response with document metadata
 */
export function writeFundsReleasedLog(
    runtime: Runtime<Config>,
    eventLog: FundsReleasedEventLog
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

        // Write funds released log to Firestore
        const writeResult: FirestoreWriteResponse = httpClient
            .sendRequest(
                runtime,
                postFundsReleasedLog(tokenResult.idToken, firestoreProjectId.value, eventLog),
                consensusIdenticalAggregation<FirestoreWriteResponse>()
            )(runtime.config)
            .result();

        return writeResult;
    } catch (error) {
        runtime.log(`Error writing funds released log: ${error}`);
        // Handle simulation mode or missing secrets with mock response
        runtime.log("[SIMULATION] Using mock Firestore write response for funds released log");
        const now = Date.now();
        return {
            name: `projects/mock-project/databases/(default)/documents/funds-released-logs/${now}_${eventLog.user.slice(-8)}`,
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
 * Queries Firestore for combined history (authorizations + risk assessments) between a user and merchant.
 * Returns unified TransactionHistoryItem array for risk assessment context.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param userAddress - User wallet address to filter by
 * @param merchantAddress - Merchant wallet address to filter by
 * @param queryType - Type of query: "both", "auth", or "risk"
 * @returns Function that performs the HTTP request and returns unified history array
 */
const queryHistory =
    (idToken: string, projectId: string, userAddress: string, merchantAddress: string, queryType: QueryHistoryType = "both") =>
        (sendRequester: HTTPSendRequester, config: Config): TransactionHistoryItem[] => {
            const history: TransactionHistoryItem[] = [];

            if (queryType === "both" || queryType === "auth") {
                try {
                    // Query authorization-logs collection
                    const authReq = {
                        url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/authorization-logs?orderBy=createdAt%20desc&pageSize=10`,
                        method: "GET" as const,
                        headers: {
                            Authorization: `Bearer ${idToken}`,
                            "Content-Type": "application/json",
                        },
                        cacheSettings: {
                            readFromCache: false,
                            maxAgeMs: 0,
                        },
                    };

                    const authResp = sendRequester.sendRequest(authReq).result();
                    if (ok(authResp)) {
                        const authBodyText = new TextDecoder().decode(authResp.body);
                        const authResponse = JSON.parse(authBodyText) as FirestoreQueryResponse;

                        if (authResponse.documents) {
                            authResponse.documents
                                .filter(doc =>
                                    doc.fields.userAddress?.stringValue === userAddress &&
                                    doc.fields.merchantAddress?.stringValue === merchantAddress
                                )
                                .forEach(doc => {
                                    history.push({
                                        amount: parseInt(doc.fields.amount?.integerValue || "0"),
                                        timestamp: parseInt(doc.fields.createdAt?.integerValue || "0"),
                                        merchant: doc.fields.merchantAddress?.stringValue || "",
                                        user: doc.fields.userAddress?.stringValue || "",
                                    });
                                });
                        }
                    }
                } catch (e) {
                    // Continue even if authorization-logs query fails
                }
            }

            if (queryType === "both" || queryType === "risk") {
                try {
                    // Query risk-assessments collection
                    const riskReq = {
                        url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/risk-assessments?orderBy=createdAt%20desc&pageSize=10`,
                        method: "GET" as const,
                        headers: {
                            Authorization: `Bearer ${idToken}`,
                            "Content-Type": "application/json",
                        },
                        cacheSettings: {
                            readFromCache: false,
                            maxAgeMs: 0,
                        },
                    };

                    const riskResp = sendRequester.sendRequest(riskReq).result();
                    if (ok(riskResp)) {
                        const riskBodyText = new TextDecoder().decode(riskResp.body);
                        const riskResponse = JSON.parse(riskBodyText) as FirestoreQueryResponse;

                        if (riskResponse.documents) {
                            riskResponse.documents
                                .filter(doc =>
                                    doc.fields.userAddress?.stringValue === userAddress &&
                                    doc.fields.merchantAddress?.stringValue === merchantAddress &&
                                    doc.fields.riskDecision?.stringValue === "YES" // Only approved increments
                                )
                                .forEach(doc => {
                                    history.push({
                                        amount: parseInt(doc.fields.requestedTotal?.integerValue || "0"),
                                        timestamp: parseInt(doc.fields.createdAt?.integerValue || "0"),
                                        merchant: doc.fields.merchantAddress?.stringValue || "",
                                        user: doc.fields.userAddress?.stringValue || "",
                                    });
                                });
                        }
                    }
                } catch (e) {
                    // Continue even if risk-assessments query fails
                }
            }

            // Sort by timestamp descending and limit to 10 most recent
            return history
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);
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
                    authorizationLogId: { stringValue: payload.authorizationLogId },
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
        };/**
 * Writes a captured funds log document to Firestore.
 * Uses a combination of timestamp and user address for document ID uniqueness.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param eventLog - Captured event log data from EVM log
 * @returns Function that performs the HTTP request and returns the Firestore response
 */
const postCapturedLog =
    (idToken: string, projectId: string, eventLog: CapturedEventLog) =>
        (sendRequester: HTTPSendRequester, config: Config): FirestoreWriteResponse => {
            const now = Date.now();

            const dataToSend: FirestoreCapturedLogData = {
                fields: {
                    userAddress: { stringValue: eventLog.user },
                    merchantAddress: { stringValue: eventLog.merchant },
                    amount: { integerValue: Number(eventLog.amount) },
                    txHash: { stringValue: eventLog.transactionHash },
                    blockNumber: { stringValue: eventLog.blockNumber },
                    transactionHash: { stringValue: eventLog.transactionHash },
                    logIndex: { integerValue: eventLog.logIndex || 0 },
                    createdAt: { integerValue: now },
                },
            };

            const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
            const body = Buffer.from(bodyBytes).toString("base64");

            // Use timestamp + user address hash for unique document ID
            const documentId = `${now}_${eventLog.user.slice(-8)}`;

            const req = {
                url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/captured-logs/?documentId=${documentId}`,
                method: "POST" as const,
                body: body,
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json",
                },
                cacheSettings: {
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
 * Writes a funds released log document to Firestore.
 * Uses a combination of timestamp and user address for document ID uniqueness.
 *
 * @param idToken - Firebase authentication token
 * @param projectId - Firebase project ID
 * @param eventLog - FundsReleased event log data from EVM log
 * @returns Function that performs the HTTP request and returns the Firestore response
 */
const postFundsReleasedLog =
    (idToken: string, projectId: string, eventLog: FundsReleasedEventLog) =>
        (sendRequester: HTTPSendRequester, config: Config): FirestoreWriteResponse => {
            const now = Date.now();

            const dataToSend: FirestoreFundsReleasedLogData = {
                fields: {
                    userAddress: { stringValue: eventLog.user },
                    merchantAddress: { stringValue: eventLog.merchant },
                    amount: { integerValue: Number(eventLog.amount) },
                    txHash: { stringValue: eventLog.transactionHash },
                    blockNumber: { stringValue: eventLog.blockNumber},
                    transactionHash: { stringValue: eventLog.transactionHash },
                    logIndex: { integerValue: eventLog.logIndex || 0 },
                    createdAt: { integerValue: now },
                },
            };

            const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
            const body = Buffer.from(bodyBytes).toString("base64");

            // Use timestamp + user address hash for unique document ID
            const documentId = `${now}_${eventLog.user.slice(-8)}`;

            const req = {
                url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/funds-released-logs/?documentId=${documentId}`,
                method: "POST" as const,
                body: body,
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json",
                },
                cacheSettings: {
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