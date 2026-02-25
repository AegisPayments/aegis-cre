// gemini.ts
// Gemini AI integration for Aegis AI Risk Engine payment risk scoring.
// Uses CRE HTTP capability to interact with Gemini REST APIs for risk assessment.

import {
    cre,
    ok,
    consensusIdenticalAggregation,
    type Runtime,
    type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import { Config, type GeminiData, type GeminiApiResponse, type RiskAssessmentDetails, type GeminiResponse, type MerchantType } from "./types";

/**
 * Base system prompt for Gemini AI risk assessment.
 * Instructs the model to act as a payment risk assessment system.
 */
const baseSystemPrompt = `
You are an AI-powered payment risk assessment system for the AegisPay platform. Your task is to analyze payment authorization adjustment requests and determine whether they should be approved or rejected based on risk factors.

Your decision-making process should consider:
1. The variance between current authorization and requested total
2. Transaction history patterns for this user-merchant pair  
3. The merchant type and its typical variance allowances
4. The provided reason for the adjustment

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
MERCHANT TYPE: EV Charging Station
VARIANCE ALLOWANCE: Up to 50% increase is acceptable
RATIONALE: EV charging amounts can vary significantly based on battery capacity, 
charging duration, and dynamic pricing. Users often need to adjust pre-authorizations
when their vehicle requires more charge than initially estimated.

APPROVAL CRITERIA:
- Variance up to 50%: Generally approve if history shows similar patterns
- Variance 50-100%: Approve with caution, check for frequency of large adjustments  
- Variance >100%: Reject unless compelling reason and good history
`;

        case "RETAIL":
            return `
MERCHANT TYPE: Retail Store
VARIANCE ALLOWANCE: 0% variance (fixed pricing)
RATIONALE: Retail purchases have fixed prices. Any significant variance suggests 
potential fraud, pricing errors, or unauthorized changes to the cart contents.

APPROVAL CRITERIA:
- Variance 0-5%: May approve for tax adjustments or small fees
- Variance 5-15%: Approve only with clear justification (tax, shipping, etc.)
- Variance >15%: Reject - indicates likely fraud or system error
`;

        case "RIDE_SHARE":
            return `
MERCHANT TYPE: Ride Share Service
VARIANCE ALLOWANCE: Up to 25% increase is acceptable
RATIONALE: Ride share costs can vary due to dynamic pricing, route changes, 
traffic conditions, and surge pricing. However, variance should be moderate.

APPROVAL CRITERIA:
- Variance up to 25%: Generally approve if within normal surge/detour range
- Variance 25-50%: Approve with caution, check for reasonable explanation
- Variance >50%: Reject unless extraordinary circumstances (major detour, etc.)
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
 * User prompt template for Gemini AI risk assessment.
 * Combines transaction history, current request, and assessment criteria.
 */
const buildUserPrompt = (details: RiskAssessmentDetails): string => {
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
 * Queries Gemini AI to assess the risk of a payment authorization adjustment.
 * Uses merchant-specific rules and transaction history for context-aware decisions.
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param details - Risk assessment details including payload and history
 * @returns Gemini API response with risk assessment decision
 */
export const assessPaymentRisk = (runtime: Runtime<Config>, details: RiskAssessmentDetails): GeminiResponse => {
    try {
        // API key for the outbound LLM request (stored in CRE secrets)
        const geminiApiKey = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();

        // Build the complete system prompt with merchant-specific rules
        const systemPrompt = baseSystemPrompt + getMerchantSpecificRules(details.merchantType);
        const userPrompt = buildUserPrompt(details);

        // Log the assessment details for debugging
        runtime.log(`Risk Assessment - Merchant Type: ${details.merchantType}`);
        runtime.log(`Current: $${details.currentAuth}, Requested: $${details.requestedTotal}`);
        runtime.log(`Reason: ${details.reason}`);

        // Fan out the HTTP request through CRE; aggregate identical responses
        const httpClient = new cre.capabilities.HTTPClient();

        const result: GeminiResponse = httpClient
            .sendRequest(
                runtime,
                PostGeminiRiskAssessment(details, systemPrompt, userPrompt, geminiApiKey.value),
                consensusIdenticalAggregation<GeminiResponse>()
            )(runtime.config)
            .result();

        return result;
    } catch (error) {
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
                    reasoning = "EV charging variance within acceptable 50% range";
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
            geminiResponse: mockResponse,
            responseId: "mock-" + Date.now(),
            rawJsonString: `{"mock": true, "response": ${mockResponse}}`,
        };
    }
}

/*********************************
 * HTTP Request Builder for Gemini
 *********************************/

/**
 * Builds and executes an HTTP request to the Gemini API for risk assessment.
 * Constructs a JSON payload with merchant-specific system instructions and user request details.
 * 
 * @param details - Risk assessment details for logging context
 * @param systemPrompt - Complete system prompt with merchant rules
 * @param userPrompt - User prompt with transaction details
 * @param geminiApiKey - Gemini API authentication key
 * @returns Function that performs the HTTP request and returns the parsed response
 */
const PostGeminiRiskAssessment =
    (details: RiskAssessmentDetails, systemPrompt: string, userPrompt: string, geminiApiKey: string) =>
        (sendRequester: HTTPSendRequester, config: Config): GeminiResponse => {
            // Compose the structured instruction + content for deterministic JSON output
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
                url: `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
                method: "POST" as const,
                body,
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": geminiApiKey,
                },
                cacheSettings: {
                    store: true,
                    maxAge: "60s",
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
                geminiResponse: text,
                responseId: externalResp.responseId,
                rawJsonString: bodyText,
            };
        };