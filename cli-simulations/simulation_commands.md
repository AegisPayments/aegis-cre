# CRE Simulation Commands

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
- Test payloads are located in `testing/payloads/` directory
