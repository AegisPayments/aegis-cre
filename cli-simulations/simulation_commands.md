# CRE Simulation Commands

## CRE CLI Flags

**Core Flags:**

- **`--broadcast`** - Execute transactions on blockchain (generates real tx hashes, uses gas)
- **`--engine-logs`** - Output detailed CRE engine logs for debugging
- **`--non-interactive`** - Skip interactive prompts (required for automated scripts)
- **`--target local-simulation`** - Use local simulation configuration
- **`--trigger-index N`** - Specify trigger: 0=HTTP, 1=Captured events, 2=Released events

**Important:** Use `--broadcast` only on test networks. It creates real transactions with gas costs.

## Generate EIP-712 Signatures

Use the minimal signature generator to create signatures for authorize payloads:

```bash
# Generate signature from file
node testing/sig-gen-minimal.js test-payload.json

# Generate signature from stdin
echo '{"user": "0x...", "merchant": "0x...", "amount": 100, "nonce": 1}' | node testing/sig-gen-minimal.js

# Example output
0xb1bf4b94003346c217da6082fdd956bade14d2af17c72f43c8336d3ee1e4b8787fffddc0d0d6ff53bb33c8df36b2131956901ca818d7ea02aa37d6c0e32c363d1b
```

The input JSON should contain: `user`, `merchant`, `amount`, and `nonce` fields.

## HTTP Trigger Simulations

### Authorize Function (Simulation Mode)

```bash
cre workflow simulate ./aegis-workflow \
  --http-payload '{"functionName": "authorize", "merchantType": "RETAIL", "user": "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", "merchant": "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", "amount": 1000, "nonce": 0, "signature": "0xb1bf4b94003346c217da6082fdd956bade14d2af17c72f43c8336d3ee1e4b8787fffddc0d0d6ff53bb33c8df36b2131956901ca818d7ea02aa37d6c0e32c363d1b"}' \
  --target local-simulation --non-interactive --trigger-index 0
```

### Secure Increment Function (Simulation Mode)

```bash
cre workflow simulate ./aegis-workflow \
  --http-payload '{"functionName": "secureIncrement", "merchantType": "EV_CHARGER", "user": "0x1234567890123456789012345678901234567890", "merchant": "0x0987654321098765432109876543210987654321", "currentAuth": 20, "requestedTotal": 25, "reason": "Minor battery adjustment"}' \
  --target local-simulation --non-interactive --trigger-index 0
```

### With Blockchain Broadcasting

Add `--broadcast` flag to execute real transactions:

```bash
cre workflow simulate ./aegis-workflow \
  --http-payload '{"functionName": "authorize", "user": "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", "merchant": "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", "amount": 1000, "nonce": 0, "signature": "0x..."}' \
  --target local-simulation --non-interactive --trigger-index 0 --broadcast
```

````

## EVM Log Trigger Simulations

> **Prerequisites**: You need actual transaction hashes from on-chain events. Use `--broadcast` flag in HTTP triggers to generate real transactions first.

### Captured Funds Event Processing

```bash
cre workflow simulate ./aegis-workflow \
  --non-interactive --trigger-index 1 \
  --evm-tx-hash YOUR_ACTUAL_TX_HASH \
  --evm-event-index 1 \
  --target local-simulation
````

### Funds Released Event Processing

```bash
cre workflow simulate ./aegis-workflow \
  --non-interactive --trigger-index 2 \
  --evm-tx-hash YOUR_ACTUAL_TX_HASH \
  --evm-event-index 1 \
  --target local-simulation
```

## Interactive Mode (Manual Testing)

For manual testing and debugging, you can run without flags:

```bash
cre workflow simulate ./aegis-workflow
```

This will prompt you to:

1. Select a trigger (HTTP, Captured events, or Released events)
2. Enter payload data manually
3. Choose simulation vs. broadcast mode

## Important Notes

- **Transaction Hashes**: Replace `YOUR_ACTUAL_TX_HASH` with real transaction hashes from broadcasted transactions
- **Inline JSON**: Use `--http-payload '...'` with inline JSON (not file paths) due to CRE CLI limitations
- **Test Payloads**: Additional test payloads are located in `testing/payloads/` directory
- **Network**: Always test on testnets only when using `--broadcast`

## Debugging

Add `--engine-logs` to any command for detailed execution logs:

```bash
cre workflow simulate ./aegis-workflow \
  --http-payload '...' \
  --target local-simulation --non-interactive --trigger-index 0 \
  --engine-logs
```

## Funds Released Log Trigger Simulation

```bash
cre workflow simulate aegis-workflow \
  --non-interactive \
  --trigger-index 2 \
  --evm-tx-hash 0xb356c6344b026a3ee5893baced116219beb3bdfab7a6becffe1269d59161558e \
  --evm-event-index 0 \
  --target local-simulation
```

## Notes - Understanding the two different indexes

1. --trigger-index selects which handler in your workflow to run (e.g., if the handler with an EVM log trigger is the third handler defined, use --trigger-index 2)
2. --evm-event-index specifies which log/event within the transaction to use for testing (e.g., if the transaction emitted 3 events and you want the first one, use --evm-event-index 0)
