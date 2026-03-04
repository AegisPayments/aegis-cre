# CRE Simulation Commands

- Add `--broadcast` flag to simulate and write the transaction onchain
- Add `--engine-logs` flag to output detailed engine logs for debugging

## Generate EIP-712 Signatures

Use the minimal signature generator to create signatures for authorize payloads:

```bash
# Generate signature from file
node sig-gen-minimal.js test-payload.json

# Generate signature from stdin
cat test-payload.json | node sig-gen-minimal.js

# Example output
0xb1bf4b94003346c217da6082fdd956bade14d2af17c72f43c8336d3ee1e4b8787fffddc0d0d6ff53bb33c8df36b2131956901ca818d7ea02aa37d6c0e32c363d1b
```

The input JSON should contain: `user`, `merchant`, `amount`, and `nonce` fields.

## Non-interactive (recommended for testing scripts)

```bash
cre workflow simulate ./aegis-workflow --http-payload '{"functionName": "secureIncrement", "merchantType": "EV_CHARGER", "user": "0x1234567890123456789012345678901234567890", "merchant": "0x0987654321098765432109876543210987654321", "currentAuth": 20, "requestedTotal": 25, "reason": "Minor battery adjustment"}' --target local-simulation --non-interactive --trigger-index 0
```

## Interactive (for manual testing)

```bash
cre workflow simulate ./aegis-workflow
```

## Notes

- Use `--http-payload '...'` with inline JSON (not file paths) due to CRE CLI bug
- Always include `--target local-simulation --non-interactive --trigger-index 0` for automated testing
- Additional Test payloads are located in `testing/payloads/` directory

## Funds Captured Log Trigger Simulation

```bash
cre workflow simulate aegis-workflow \
  --non-interactive \
  --trigger-index 1 \
  --evm-tx-hash 0xb356c6344b026a3ee5893baced116219beb3bdfab7a6becffe1269d59161558e \
  --evm-event-index 1 \
  --target local-simulation
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
