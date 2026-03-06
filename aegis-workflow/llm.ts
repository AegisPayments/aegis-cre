// llm.ts
// LLM integration for Aegis AI Risk Engine supporting both Gemini and OpenAI APIs.
// Uses CRE HTTP capability to interact with LLM REST APIs for risk assessment and fraud detection.

import {
    cre,
    ok,
    consensusIdenticalAggregation,
    type Runtime,
    type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
    type Config,
    type LLMResponse,
    type LLMResult,
    type RiskAssessmentDetails,
    type FraudAssessmentDetails,
    type MerchantType,
    type GeminiData,
    type OpenAIData,
    type GeminiApiResponse,
    type OpenAIApiResponse,
} from "./types";

/**
 * Base system prompt for LLM AI risk assessment.
 * Instructs the model to act as a payment risk assessment system.
 */
const riskAssessmentSystemPrompt = `
You are an AI-powered payment risk assessment system for the AegisPay platform. Your task is to analyze payment authorization adjustment requests and determine whether they should be approved or rejected based on risk factors.

TRANSACTION HISTORY FORMAT:
- Each history entry includes: amount, decision (AUTHORIZED/DECLINED/INCREMENT_APPROVED/INCREMENT_DECLINED), and merchantType
- DECLINED means a previous authorization was rejected by fraud detection
- INCREMENT_DECLINED means a previous payment adjustment was rejected by risk assessment

Your decision-making process should consider:
1. The variance between current authorization and requested total
2. Transaction history patterns for this user-merchant pair, INCLUDING PAST DECISIONS
3. The merchant type and its typical variance allowances
4. The provided reason for the adjustment
5. Consistency of merchant type across the user's history

HISTORY-BASED RULES:
- A history of DECLINED authorizations for this user-merchant pair significantly increases risk
- Multiple INCREMENT_DECLINED entries suggest the user/merchant is repeatedly pushing limits - apply stricter scrutiny
- Clean history (all AUTHORIZED/INCREMENT_APPROVED) is a positive signal that supports approval
- If the user's history shows a different merchantType than the current request, note this inconsistency as a risk factor

OUTPUT FORMAT (CRITICAL):
- You MUST respond with a SINGLE JSON object that satisfies this exact schema:
  {
    "result": "YES" | "NO",
    "confidence": <integer between 0 and 10000>,
    "reasoning": "<brief explanation of decision>"
  }

STRICT RULES:
- Output MUST be valid JSON. No markdown, no backticks, no code fences, no prose outside JSON.
- Output MUST be MINIFIED (one line, no extraneous whitespace or newlines).
- Property order: "result" first, then "confidence", then "reasoning".
- "YES" means approve the payment adjustment
- "NO" means reject the payment adjustment
- Confidence scale: 0 = no confidence, 10000 = maximum confidence
- Reasoning should be concise (under 100 characters)

If you cannot make a determination, use "NO" with appropriate confidence and reasoning.

REMINDER:
- Your ENTIRE response must be ONLY the JSON object described above.
`;

/**
 * Base system prompt for LLM AI fraud detection.
 * Instructs the model to act as a fraud detection system for payment authorization.
 */
const fraudDetectionSystemPrompt = `
You are an AI-powered fraud detection system for the AegisPay platform. Your task is to analyze payment authorization requests and determine whether they are legitimate or potentially fraudulent.

IMPORTANT CONTEXT: These are AUTHORIZE transactions with cryptographically signed EIP-712 signatures, providing strong authentication. The presence of a valid signature is significant evidence of legitimacy, but does not override all other signals. Be appropriately lenient for legitimate small to medium transactions.

TRANSACTION HISTORY FORMAT:
- Each history entry includes: amount, decision (AUTHORIZED/DECLINED/INCREMENT_APPROVED/INCREMENT_DECLINED), and merchantType
- DECLINED means a previous authorization was rejected by fraud detection
- INCREMENT_DECLINED means a previous payment adjustment was rejected by risk assessment

Your decision-making process should consider:
1. Transaction amount patterns and anomalies
2. User transaction history and behavior patterns, INCLUDING PAST DECISIONS
3. Signature and authentication validity context (signatures provide strong legitimacy evidence)
4. Timing and frequency of transactions
5. Amount reasonableness for the merchant type
6. Merchant type context (EV_CHARGER typically has higher amounts than RETAIL)

HISTORY-BASED RULES (CRITICAL):
- If the user's history shows a recent DECLINED authorization (fraud rejection), apply heightened scrutiny to this request
- Multiple consecutive DECLINED transactions are a strong fraud signal - reject with high confidence
- A mix of AUTHORIZED and DECLINED with no clear pattern suggests possible account compromise
- Clean history (all AUTHORIZED/INCREMENT_APPROVED) with consistent merchant types is a positive signal
- If history shows mostly DECLINED but the current amount is small and signed, still consider carefully rather than auto-rejecting

APPROVAL GUIDELINES:
- Small amounts ($1-$100) with valid signatures and clean history: Approve
- Small amounts ($1-$100) with valid signatures but recent DECLINED history: Apply scrutiny, may still approve if amount is reasonable
- Moderate amounts ($100-$1000): Approve with clean transaction patterns
- Large amounts (>$1000): Apply stricter scrutiny but consider signature validity and merchant type
- No transaction history + small amount + valid signature: DEFAULT TO APPROVE (new users are not suspicious)
- Very high amounts (>$10,000): Require strong legitimacy indicators and clean history

OUTPUT FORMAT (CRITICAL):
- You MUST respond with a SINGLE JSON object that satisfies this exact schema:
  {
    "result": "YES" | "NO",
    "confidence": <integer between 0 and 10000>,
    "reasoning": "<brief explanation of decision>"
  }

STRICT RULES:
- Output MUST be valid JSON. No markdown, no backticks, no code fences, no prose outside JSON.
- Output MUST be MINIFIED (one line, no extraneous whitespace or newlines).
- Property order: "result" first, then "confidence", then "reasoning".
- "YES" means the transaction appears legitimate (approve)
- "NO" means the transaction appears fraudulent (reject)
- Confidence scale: 0 = no confidence, 10000 = maximum confidence
- Reasoning should be concise (under 100 characters)

If you cannot make a determination for small amounts (<$100) with valid signatures, DEFAULT TO "YES" with moderate confidence. Only use "NO" when there are clear fraud indicators.

REMINDER:
- Your ENTIRE response must be ONLY the JSON object described above.
`;

/**
 * Gets merchant-specific risk assessment rules based on merchant type.
 * These rules determine the variance tolerance for payment adjustments.
 *
 * @param merchantType - The type of merchant (EV_CHARGER, RETAIL, RIDE_SHARE)
 * @returns Merchant-specific system prompt with variance rules
 */
const getMerchantSpecificRules = (merchantType: MerchantType): string => {
    switch (merchantType) {
        case "EV_CHARGER":
            return `
MERCHANT TYPE: Electric Vehicle Charging Station
VARIANCE ALLOWANCE: Up to 50% increase is acceptable
RATIONALE: EV charging costs vary significantly based on:
- Dynamic electricity pricing (peak/off-peak rates)
- Charging speed selection (fast vs standard charging)
- Session duration changes (longer than expected charging time)
- Battery state and charging curve efficiency

APPROVAL CRITERIA:
- Variance up to 25%: Generally approve with minimal scrutiny
- Variance 25-50%: Approve if reason mentions pricing/speed changes
- Variance >50%: Requires compelling technical justification
`;

        case "RETAIL":
            return `
MERCHANT TYPE: Retail Store
VARIANCE ALLOWANCE: Up to 5% increase is acceptable
RATIONALE: Retail transactions should be predictable with minimal variance:
- Items have fixed prices with occasional sales tax adjustments
- Limited legitimate reasons for significant price changes
- High variance often indicates pricing errors or fraud attempts

APPROVAL CRITERIA:
- Variance up to 5%: May approve for tax adjustments, tips, or small add-ons
- Variance >5%: Investigate thoroughly - likely error or fraudulent activity
`;

        case "RIDE_SHARE":
            return `
MERCHANT TYPE: Ride Share Service
VARIANCE ALLOWANCE: Up to 25% increase is acceptable
RATIONALE: Ride share pricing includes many dynamic factors:
- Surge pricing during high-demand periods
- Route changes due to traffic or passenger requests
- Wait times and additional stops
- Tips and service fees

APPROVAL CRITERIA:
- Variance up to 15%: Generally approve for standard ride adjustments
- Variance 15-25%: Approve if reason mentions surge pricing or route changes
- Variance >25%: Requires justification for extreme pricing conditions
`;

        default:
            return `
MERCHANT TYPE: Unknown/Generic
VARIANCE ALLOWANCE: Up to 10% increase is acceptable
RATIONALE: Conservative approach for unknown merchant types to minimize risk.

APPROVAL CRITERIA:
- Variance up to 10%: May approve with good transaction history
- Variance >10%: Reject unless very compelling reason provided
`;
    }
};

/**
 * User prompt template for LLM AI risk assessment.
 * Combines transaction history, current request, and assessment criteria.
 */
const buildRiskAssessmentUserPrompt = (details: RiskAssessmentDetails): string => {
    const variance = details.currentAuth > 0
        ? ((details.requestedTotal - details.currentAuth) / details.currentAuth) * 100
        : 0;

    return `
PAYMENT ADJUSTMENT REQUEST ANALYSIS:

User: ${details.userAddress}
Merchant: ${details.merchantAddress}
Current Authorization: $${details.currentAuth}
Requested Total: $${details.requestedTotal}
Variance: ${variance.toFixed(1)}%
Reason: "${details.reason}"

TRANSACTION HISTORY:
${details.transactionHistory}

Please analyze this payment adjustment request and provide your risk assessment decision in the required JSON format.
`;
};

/**
 * User prompt template for LLM AI fraud detection.
 * Combines transaction details and history for fraud analysis.
 */
const buildFraudDetectionUserPrompt = (details: FraudAssessmentDetails): string => {
    return `
PAYMENT AUTHORIZATION FRAUD ANALYSIS:

User: ${details.userAddress}
Merchant: ${details.merchantAddress}
Amount: $${details.amount}
Nonce: ${details.nonce}
Signature: ${details.signature.substring(0, 20)}...

TRANSACTION HISTORY:
${details.transactionHistory}

Please analyze this payment authorization request for potential fraud indicators and provide your assessment in the required JSON format.
`;
};

/**
 * Queries LLM AI to assess the risk of a payment authorization adjustment.
 * Uses merchant-specific rules and transaction history for context-aware decisions.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param details - Risk assessment details including payload and history
 * @returns LLM API response with risk assessment decision
 */
export const assessPaymentRisk = (runtime: Runtime<Config>, details: RiskAssessmentDetails): LLMResponse => {
    try {
        // API key for the outbound LLM request (stored in CRE secrets)
        const apiKey = runtime.getSecret({ id: runtime.config.llm.apiKeyId }).result();
        // runtime.log(`API KEY for LLM request retrieved successfully: ${apiKey.value.substring(0, 4)}...`);

        // Build the complete system prompt with merchant-specific rules
        const systemPrompt = riskAssessmentSystemPrompt + getMerchantSpecificRules(details.merchantType);
        const userPrompt = buildRiskAssessmentUserPrompt(details);

        // Log the assessment details for debugging
        runtime.log(`Risk Assessment - Merchant Type: ${details.merchantType}`);
        runtime.log(`Current: $${details.currentAuth}, Requested: $${details.requestedTotal}`);
        runtime.log(`Reason: ${details.reason}`);

        // Fan out the HTTP request through CRE; aggregate identical responses
        const httpClient = new cre.capabilities.HTTPClient();

        const result: LLMResponse = httpClient
            .sendRequest(
                runtime,
                PostLLMRiskAssessment(details, systemPrompt, userPrompt, apiKey.value),
                consensusIdenticalAggregation<LLMResponse>()
            )(runtime.config)
            .result();

        return result;
    } catch (error) {
        runtime.log(`ERROR during LLM ${error}`)
        // Handle simulation mode or missing secrets with mock AI decision
        runtime.log("[SIMULATION] Using mock AI risk assessment");

        // Simulate AI decision based on merchant type and variance
        const variance = details.currentAuth > 0
            ? ((details.requestedTotal - details.currentAuth) / details.currentAuth) * 100
            : 0;

        let decision = "NO";
        let confidence = 5000;
        let reasoning = "Simulation mode default rejection";

        // Apply basic business logic for simulation
        switch (details.merchantType) {
            case "EV_CHARGER":
                if (variance <= 50) {
                    decision = "YES";
                    confidence = 8500;
                    reasoning = "EV charger variance within acceptable 50% range";
                }
                break;
            case "RETAIL":
                if (variance <= 5) {
                    decision = "YES";
                    confidence = 9000;
                    reasoning = "Retail variance within acceptable 5% range";
                }
                break;
            case "RIDE_SHARE":
                if (variance <= 25) {
                    decision = "YES";
                    confidence = 8000;
                    reasoning = "Ride share variance within acceptable 25% range";
                }
                break;
        }

        const mockResponse = JSON.stringify({
            result: decision,
            confidence: confidence,
            reasoning: reasoning
        });

        return {
            statusCode: 200,
            llmResponse: mockResponse,
            responseId: "mock-" + Date.now(),
            rawJsonString: `{"mock": true, "response": ${mockResponse}}`,
        };
    }
};

/**
 * Queries LLM AI to assess the fraud risk of a payment authorization.
 * Uses transaction patterns and behavioral analysis for fraud detection.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param details - Fraud assessment details including transaction data
 * @returns LLM API response with fraud assessment decision
 */
export const assessFraudRisk = (runtime: Runtime<Config>, details: FraudAssessmentDetails): LLMResponse => {
    try {
        // API key for the outbound LLM request (stored in CRE secrets)
        const apiKey = runtime.getSecret({ id: runtime.config.llm.apiKeyId }).result();
        // runtime.log(`API KEY for LLM request retrieved successfully: ${apiKey.value.substring(0, 4)}...`);

        const systemPrompt = fraudDetectionSystemPrompt;
        const userPrompt = buildFraudDetectionUserPrompt(details);

        // Log the assessment details for debugging
        runtime.log(`Fraud Assessment - User: ${details.userAddress}`);
        runtime.log(`Amount: $${details.amount}, Merchant: ${details.merchantAddress}`);

        // Fan out the HTTP request through CRE; aggregate identical responses
        const httpClient = new cre.capabilities.HTTPClient();

        const result: LLMResponse = httpClient
            .sendRequest(
                runtime,
                PostLLMFraudAssessment(details, systemPrompt, userPrompt, apiKey.value),
                consensusIdenticalAggregation<LLMResponse>()
            )(runtime.config)
            .result();

        return result;
    } catch (error) {
        runtime.log(`ERROR during LLM ${error}`)
        // Handle simulation mode or missing secrets with mock AI decision
        runtime.log("[SIMULATION] Using mock AI fraud assessment");

        // Simple fraud simulation logic based on amount patterns
        // Default to legitimate since this is an authorize function with valid signature
        let decision = "YES";
        let confidence = 8000;
        let reasoning = "Simulation mode - signed transaction appears legitimate";

        // Basic fraud detection simulation - be more lenient for signed authorize transactions
        if (details.amount > 20000) {
            decision = "NO";
            confidence = 6000;
            reasoning = "Simulation mode - very high amount flagged";
        } else if (details.amount < 0.01) {
            decision = "NO";
            confidence = 7000;
            reasoning = "Simulation mode - suspicious micro amount";
        } else if (details.amount >= 1 && details.amount <= 1000) {
            // Small to moderate amounts with signatures should be approved
            decision = "YES";
            confidence = 8500;
            reasoning = "Simulation mode - small signed amount approved";
        }

        const mockResponse = JSON.stringify({
            result: decision,
            confidence: confidence,
            reasoning: reasoning
        });

        return {
            statusCode: 200,
            llmResponse: mockResponse,
            responseId: "mock-fraud-" + Date.now(),
            rawJsonString: `{"mock": true, "response": ${mockResponse}}`,
        };
    }
};

/*********************************
 * HTTP Request Builders for LLMs
 *********************************/

/**
 * Builds and executes an HTTP request to the LLM API for risk assessment.
 * Supports both Gemini and OpenAI APIs based on configuration.
 * 
 * @param details - Risk assessment details for logging context
 * @param systemPrompt - Complete system prompt with merchant rules
 * @param userPrompt - User prompt with transaction details
 * @param apiKey - LLM API authentication key
 * @returns Function that performs the HTTP request and returns the parsed response
 */
const PostLLMRiskAssessment =
    (details: RiskAssessmentDetails, systemPrompt: string, userPrompt: string, apiKey: string) =>
        (sendRequester: HTTPSendRequester, config: Config): LLMResponse => {
            if (config.llm.provider === "gemini") {
                return postGeminiRequest(details, systemPrompt, userPrompt, apiKey, sendRequester, config);
            } else if (config.llm.provider === "openai") {
                return postOpenAIRequest(details, systemPrompt, userPrompt, apiKey, sendRequester, config);
            } else {
                throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
            }
        };

/**
 * Builds and executes an HTTP request to the LLM API for fraud assessment.
 * Supports both Gemini and OpenAI APIs based on configuration.
 * 
 * @param details - Fraud assessment details for logging context
 * @param systemPrompt - Complete system prompt for fraud detection
 * @param userPrompt - User prompt with transaction details
 * @param apiKey - LLM API authentication key
 * @returns Function that performs the HTTP request and returns the parsed response
 */
const PostLLMFraudAssessment =
    (details: FraudAssessmentDetails, systemPrompt: string, userPrompt: string, apiKey: string) =>
        (sendRequester: HTTPSendRequester, config: Config): LLMResponse => {
            if (config.llm.provider === "gemini") {
                return postGeminiFraudRequest(details, systemPrompt, userPrompt, apiKey, sendRequester, config);
            } else if (config.llm.provider === "openai") {
                return postOpenAIFraudRequest(details, systemPrompt, userPrompt, apiKey, sendRequester, config);
            } else {
                throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
            }
        };

/**
 * Generic Gemini API request handler for risk assessment.
 */
function postGeminiRequest(
    details: RiskAssessmentDetails,
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    sendRequester: HTTPSendRequester,
    config: Config
): LLMResponse {
    const dataToSend: GeminiData = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
            {
                parts: [
                    {
                        text: userPrompt,
                    },
                ],
            },
        ]
    };

    // Encode request body as base64 (required by CRE HTTP capability)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
    const body = Buffer.from(bodyBytes).toString("base64");

    const req = {
        url: config.llm.apiUrl,
        method: "POST" as const,
        body,
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        cacheSettings: {
            // store: true,
            // maxAge: "60s",
            readFromCache: true,
            maxAgeMs: 60_000,
        },
    };

    // Perform the request within CRE infra; result() yields the response
    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}. Error: ${bodyText}`);

    // Parse and extract the model text
    const externalResp = JSON.parse(bodyText) as GeminiApiResponse;

    const text = externalResp?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Malformed LLM response: missing candidates[0].content.parts[0].text");

    return {
        statusCode: resp.statusCode,
        llmResponse: text,
        responseId: externalResp.responseId,
        rawJsonString: bodyText,
    };
}

/**
 * Generic Gemini API request handler for fraud assessment.
 */
function postGeminiFraudRequest(
    details: FraudAssessmentDetails,
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    sendRequester: HTTPSendRequester,
    config: Config
): LLMResponse {
    const dataToSend: GeminiData = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
            {
                parts: [
                    {
                        text: userPrompt,
                    },
                ],
            },
        ]
    };

    // Encode request body as base64 (required by CRE HTTP capability)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
    const body = Buffer.from(bodyBytes).toString("base64");

    const req = {
        url: config.llm.apiUrl,
        method: "POST" as const,
        body,
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        cacheSettings: {
            // store: true,
            // maxAge: "60s",
            readFromCache: true,
            maxAgeMs: 60_000,
        },
    };

    // Perform the request within CRE infra; result() yields the response
    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}. Error: ${bodyText}`);

    // Parse and extract the model text
    const externalResp = JSON.parse(bodyText) as GeminiApiResponse;

    const text = externalResp?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Malformed LLM response: missing candidates[0].content.parts[0].text");

    return {
        statusCode: resp.statusCode,
        llmResponse: text,
        responseId: externalResp.responseId,
        rawJsonString: bodyText,
    };
}

/**
 * Generic OpenAI API request handler for risk assessment.
 */
function postOpenAIRequest(
    details: RiskAssessmentDetails,
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    sendRequester: HTTPSendRequester,
    config: Config
): LLMResponse {
    const dataToSend: OpenAIData = {
        model: config.llm.model,
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ],
        response_format: {
            type: "json_object",
        },
    };

    // Encode request body as base64 (required by CRE HTTP capability)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
    const body = Buffer.from(bodyBytes).toString("base64");

    const req = {
        url: config.llm.apiUrl,
        method: "POST" as const,
        body,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        cacheSettings: {
            // store: true,
            // maxAge: "60s",
            readFromCache: true,
            maxAgeMs: 60_000,
        },
    };

    // Perform the request within CRE infra; result() yields the response
    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}. Error: ${bodyText}`);

    // Parse and extract the model text
    const externalResp = JSON.parse(bodyText) as OpenAIApiResponse;

    const text = externalResp?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Malformed LLM response: missing choices[0].message.content");

    return {
        statusCode: resp.statusCode,
        llmResponse: text,
        responseId: externalResp.id,
        rawJsonString: bodyText,
    };
}

/**
 * Generic OpenAI API request handler for fraud assessment.
 */
function postOpenAIFraudRequest(
    details: FraudAssessmentDetails,
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    sendRequester: HTTPSendRequester,
    config: Config
): LLMResponse {
    const dataToSend: OpenAIData = {
        model: config.llm.model,
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ],
        response_format: {
            type: "json_object",
        },
    };

    // Encode request body as base64 (required by CRE HTTP capability)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
    const body = Buffer.from(bodyBytes).toString("base64");

    const req = {
        url: config.llm.apiUrl,
        method: "POST" as const,
        body,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        cacheSettings: {
            // store: true,
            // maxAge: "60s",
            readFromCache: true,
            maxAgeMs: 60_000,
        },
    };

    // Perform the request within CRE infra; result() yields the response
    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) throw new Error(`HTTP request failed with status: ${resp.statusCode}. Error: ${bodyText}`);

    // Parse and extract the model text
    const externalResp = JSON.parse(bodyText) as OpenAIApiResponse;

    const text = externalResp?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Malformed LLM response: missing choices[0].message.content");

    return {
        statusCode: resp.statusCode,
        llmResponse: text,
        responseId: externalResp.id,
        rawJsonString: bodyText,
    };
}