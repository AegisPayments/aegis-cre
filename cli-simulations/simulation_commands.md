# CRE Simulation Commands

- Add `--broadcast` flag to simulate and write the transaction onchain

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
cre workflow simulate my-workflow \
  --non-interactive \
  --trigger-index 1 \
  --evm-tx-hash 0xyourtxhash \
  --evm-event-index 1 \
  --target local-simulation
```

## Notes - Understanding the two different indexes

1. --trigger-index selects which handler in your workflow to run (e.g., if the handler with an EVM log trigger is the third handler defined, use --trigger-index 2)
2. --evm-event-index specifies which log/event within the transaction to use for testing (e.g., if the transaction emitted 3 events and you want the first one, use --evm-event-index 0)

