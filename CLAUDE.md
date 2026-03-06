# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AegisPay CRE is the off-chain AI risk engine for the AegisPay Web3 payment protocol. It runs on Chainlink's CRE (Chainlink Runtime Environment) and provides:
- AI-powered fraud detection and risk assessment for payment authorizations
- LLM-based evaluation of payment adjustment (secureIncrement) requests
- On-chain event monitoring with Firestore audit trail sync

The companion smart contracts live at [aegis-contracts](https://github.com/AegisPayments/aegis-contracts.git).

## Build & Development Commands

```bash
# Install workflow dependencies (uses Bun)
cd aegis-workflow && bun install

# Install test dependencies (uses npm)
cd testing && npm install

# Simulate the full CRE workflow locally
cre workflow simulate ./aegis-workflow --target local-simulation --non-interactive --trigger-index 0

# Run all tests
cd testing && npm run test:all

# Individual test commands
npm run test:signatures        # Generate EIP-712 test signatures
npm run test:authorize         # Test authorization workflow
npm run test:secure-increment  # Test secure increment workflow
npm run test:firebase          # Test Firebase connectivity
npm run test:authandinc        # Run authorize + secure-increment sequentially
```

## Architecture

### Trigger System (3 triggers registered in main.ts)

| Index | Type | Handler | Purpose |
|-------|------|---------|---------|
| 0 | HTTP | `onHttpTrigger` | Routes `authorize` and `secureIncrement` requests |
| 1 | EVM Log | `onCapturedLog` | Monitors `Captured(address,address,uint256)` events |
| 2 | EVM Log | `onFundsReleasedLog` | Monitors `FundsReleased(address,address,uint256)` events |

### Core Flow (HTTP trigger)

1. **`http-callback.ts`** - Router: parses `functionName` from payload, dispatches to handler
2. **`authorize.ts`** - Validates EIP-712 signature, calls `assessFraudRisk()` LLM, executes on-chain `authorize()` via Chainlink Forwarder, logs to Firestore
3. **`secure-increment.ts`** - Fetches transaction history from Firestore, calls `assessPaymentRisk()` LLM with merchant-specific rules, executes on-chain `secureIncrement()`, logs to Firestore

### Key Modules

- **`types.ts`** - All types, Zod schemas (`configSchema`, `LLMResponseSchema`), and Firestore document structures
- **`llm.ts`** - Dual-provider LLM integration (Gemini/OpenAI). Contains system prompts for risk assessment and fraud detection. Merchant-specific rules via `getMerchantSpecificRules()`
- **`firebase.ts`** - Firestore REST API integration via CRE HTTP capability. Handles reads (transaction history) and writes (audit logs). Uses Firebase anonymous auth for write operations

### CRE SDK Patterns

All HTTP requests go through `cre.capabilities.HTTPClient` with `consensusIdenticalAggregation`. Request bodies must be base64-encoded. The CRE runtime provides `runtime.config`, `runtime.getSecret()`, and `runtime.log()`. There is a quota limit of 5 HTTP calls per workflow execution (`PerWorkflow.HTTPAction.CallLimit`).

### EVM Log Callbacks

`captured-funds.ts` and `funds-released.ts` decode EVM log events and write them to Firestore collections (`captured-logs`, `funds-released-logs`), maintaining a complete audit trail synced with on-chain state.

## Configuration

- **`aegis-workflow/workflow.yaml`** - Per-target workflow settings (entry point, config path, secrets path)
- **`project.yaml`** - Per-target RPC endpoints
- **`secrets.yaml`** - Maps secret names to env var names: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`
- **`aegis-workflow/config.local.json`** - Local config with `llm` (provider, model, apiUrl, apiKeyId) and `evmConfigs` (chainSelectorName, contractAddress, gasLimit). Gitignored.

## Conventions

- TypeScript with Zod for runtime validation of config and LLM responses
- Workflow code uses `@chainlink/cre-sdk` APIs exclusively (no direct `fetch`)
- Bun for the workflow package, npm for the testing package
- Commit messages follow conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`)
- Merchant types: `EV_CHARGER` (50% variance), `RIDE_SHARE` (25%), `RETAIL` (5%), `GENERIC` (10%)
- LLM responses must be minified JSON: `{"result":"YES"|"NO","confidence":0-10000,"reasoning":"..."}`
