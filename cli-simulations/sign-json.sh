#!/bin/bash

# Simple EIP-712 Signature Generator for AegisProtocol
# Usage: echo '{"user":"0x...","merchant":"0x...","amount":1000,"nonce":1}' | ./sign_json.sh [private_key]
# Or: ./sign_json.sh [private_key] < input.json

# ex:- echo '{
#   "functionName": "authorize",
#   "user": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
#   "merchant": "0x0987654321098765432109876543210987654321",
#   "amount": 1000,
#   "nonce": 1,
#   "signature": "0x5f47683babed6d7097d67c9d50ba597f78f6c29085457391fad74b01d4756a1c179ddb02a2049c3d8e92c89075003ef8fab8115045dfb930ccf1eb8ec7d8e3761b"
# }' | ./cli-simulations/sign-json.sh 

set -e

# Load .env file if it exists
if [[ -f .env ]]; then
    # Export variables from .env file
    set -a  # automatically export all variables
    source .env
    set +a  # disable automatic export
fi

# Contract constants
CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-$CONTRACT_ADDRESS}"
CHAIN_ID="${CHAIN_ID:-11155111}"

PRIVATE_KEY="${1:-$CRE_ETH_PRIVATE_KEY}"

# Validate required variables
if [[ -z "$CONTRACT_ADDRESS" ]]; then
    echo "❌ Error: CONTRACT_ADDRESS or CONTRACT_ADDRESS not set in .env file"
    echo "Please set CONTRACT_ADDRESS=0x... in your .env file"
    exit 1
fi

if [[ -z "$RPC_URL" ]]; then
    echo "❌ Error: RPC_URL not set in .env file"  
    echo "Please set RPC_URL=https://... in your .env file"
    exit 1
fi

# Read JSON from stdin
JSON_INPUT=$(cat)

# Extract values from JSON using basic parsing (requires jq for robust parsing)
if command -v jq >/dev/null 2>&1; then
    USER=$(echo "$JSON_INPUT" | jq -r '.user')
    MERCHANT=$(echo "$JSON_INPUT" | jq -r '.merchant') 
    AMOUNT=$(echo "$JSON_INPUT" | jq -r '.amount')
    NONCE=$(echo "$JSON_INPUT" | jq -r '.nonce')
else
    echo "⚠️  jq not found. Using basic grep parsing..."
    USER=$(echo "$JSON_INPUT" | grep -o '"user":"[^"]*"' | cut -d'"' -f4)
    MERCHANT=$(echo "$JSON_INPUT" | grep -o '"merchant":"[^"]*"' | cut -d'"' -f4)  
    AMOUNT=$(echo "$JSON_INPUT" | grep -o '"amount":[0-9]*' | cut -d':' -f2)
    NONCE=$(echo "$JSON_INPUT" | grep -o '"nonce":[0-9]*' | cut -d':' -f2)
fi

# Get the EIP-712 hash directly from the contract
echo "🔍 Getting EIP-712 hash from contract..."
EIP712_HASH=$(cast call "$CONTRACT_ADDRESS" "getAuthorizationHash(address,address,uint256,uint256)" "$USER" "$MERCHANT" "$AMOUNT" "$NONCE" --rpc-url "$RPC_URL")

if [[ -z "$EIP712_HASH" ]]; then
    echo "❌ Error: Failed to get hash from contract"
    exit 1
fi

# Sign if private key provided
if [[ -n "$PRIVATE_KEY" ]]; then
    SIGNATURE=$(cast wallet sign --private-key "$PRIVATE_KEY" "$EIP712_HASH" 2>/dev/null)
else
    SIGNATURE="<SIGN_THIS_HASH: $EIP712_HASH>"
fi

# Output JSON
echo "{"
echo "  \"functionName\": \"authorize\","
echo "  \"user\": \"$USER\","
echo "  \"merchant\": \"$MERCHANT\","  
echo "  \"amount\": $AMOUNT,"
echo "  \"nonce\": $NONCE,"
echo "  \"signature\": \"$SIGNATURE\","
echo "  \"eip712Hash\": \"$EIP712_HASH\""
echo "}"