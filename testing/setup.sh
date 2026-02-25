#!/bin/bash
# Setup script for Aegis CRE Testing Framework

set -e

echo "🔧 Setting up Aegis CRE Testing Framework..."

# Navigate to testing directory
cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if CRE CLI is installed
if ! command -v cre &> /dev/null; then
    echo "⚠️  CRE CLI not found. Please install it from https://cre.chain.link"
    echo "   The testing framework will still work, but CRE simulation tests will fail."
else
    echo "✅ CRE CLI found: $(cre --version)"
fi

# Note: No need to chmod JS files when running via npm commands

# Create reports directory
mkdir -p test-reports

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update contract address in test-signature-generation.js"
echo "2. Run: npm run test:all"
echo "3. Or run individual tests:"
echo "   - npm run test:signatures      # Generate EIP-712 signatures"
echo "   - npm run test:authorize       # Test authorize function" 
echo "   - npm run test:secure-increment # Test secureIncrement function"
echo ""
echo "📖 See README.md for detailed usage instructions."