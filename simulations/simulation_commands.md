```bash
cre workflow simulate ./aegis-workflow --http-payload '{"merchantType": "EV_CHARGER", "user": "0x1234567890123456789012345678901234567890", "merchant": "0x0987654321098765432109876543210987654321", "currentAuth": 20, "requestedTotal": 25, "reason": "Minor battery adjustment"}' --target local-simulation --non-interactive --trigger-index 0
```

- Interactive
```bash
cre workflow simulate ./aegis-workflow
```