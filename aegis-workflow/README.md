# AegisPay CRE Workflow

This directory contains the main Chainlink Runtime Environment (CRE) workflow for AegisPay's AI-powered payment authorization system.

## Quick Setup

1. **Install dependencies**:

   ```bash
   bun install
   ```

2. **Configure environment**:

   ```bash
   cp config.local.json.example config.local.json
   # Edit config.local.json with your Firebase, LLM, and EVM configurations
   ```

3. **Simulate the workflow**:
   ```bash
   # Run from repository root
   cre workflow simulate ./aegis-workflow --target local-simulation
   ```

## Configuration

Ensure your `config.local.json` includes:

- **Firebase credentials** for transaction history storage
- **LLM API keys** (Gemini or OpenAI) for risk assessment
- **EVM configuration** with contract address and chain details
- **Private key** for on-chain transaction execution

## Workflow Structure

- **`main.ts`** - Entry point and trigger registration
- **`firebase.ts`** - Firestore integration for audit logging
- **`llm.ts`** - AI risk assessment engine
- **`types.ts`** - TypeScript type definitions
- **`cre-callbacks/`** - HTTP and EVM log trigger handlers

For detailed documentation, see the [main repository README](../README.md).
