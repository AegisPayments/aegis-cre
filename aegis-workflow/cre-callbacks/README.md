# CRE Callbacks

This directory contains the modular callback handlers for the Aegis Protocol CRE workflow.

## Structure

- **`http-callback.ts`** - Main HTTP trigger router that dispatches requests based on `functionName`
- **`secure-increment.ts`** - Handles AI-powered risk assessment for payment adjustments (prefix 0x02)
- **`authorize.ts`** - Handles payment authorization with signature verification (prefix 0x01)
- **`index.ts`** - Exports for clean imports

## Function Routing

The HTTP callback router accepts payloads with a `functionName` field:

### secureIncrement

- **Purpose**: AI-powered risk assessment for payment adjustments
- **Prefix**: 0x02 (for smart contract routing)
- **Payload**: Includes `merchantType`, `user`, `merchant`, `currentAuth`, `requestedTotal`, `reason`
- **Flow**: History → AI Assessment → On-chain Action → Logging

### authorize

- **Purpose**: Payment authorization with cryptographic signature verification
- **Prefix**: 0x01 (for smart contract routing)
- **Payload**: Includes `user`, `merchant`, `amount`, `nonce`, `signature`
- **Flow**: Validation → On-chain Authorization → Logging

## Smart Contract Integration

The callbacks encode data with appropriate prefix bytes for the smart contract's `_processReport` function:

- 0x01 prefix routes to `_authorize` functionality
- 0x02 prefix routes to `_secureIncrement` functionality
