# Contributing to AegisPay CRE

Thank you for your interest in contributing to AegisPay CRE! This project is the AI Risk Engine and orchestration layer for the AegisPay decentralized payment protocol.

## 🚀 Quick Start for Contributors

### 1. Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/aegis-cre.git
cd aegis-cre

# Install dependencies
cd aegis-workflow && bun install
cd ../testing && npm install

# Set up your configuration
cd ../aegis-workflow
cp config.local.json.example config.local.json
# Edit config.local.json with your Firebase and LLM credentials
```

### 2. Run Tests

```bash
# Test Firebase connectivity
cd testing
npm run test:firebase

# Run complete test suite
npm run test:all

# Test CRE workflow simulation
cd ../
cre workflow simulate ./aegis-workflow --target local-simulation
```

## 🛡️ Code Quality Standards

### TypeScript Requirements

- **Strong typing**: Use explicit types, avoid `any`
- **JSDoc comments**: Document all public functions with examples
- **Error handling**: Proper try-catch blocks and error propagation
- **Async patterns**: Use async/await consistently

### Security Guidelines

- **Secret management**: Never commit API keys or private keys
- **Input validation**: Validate all external inputs (HTTP payloads, LLM responses)
- **Authentication**: Ensure proper Firebase auth token handling
- **Audit logging**: Log all security-relevant decisions

### Testing Requirements

- **Unit tests**: Cover all new business logic functions
- **Integration tests**: Test end-to-end workflows
- **LLM testing**: Validate AI decision logic with various scenarios
- **Simulation tests**: Ensure CRE workflows execute correctly

## 📂 Project Structure

```
aegis-cre/
├── aegis-workflow/           # Main CRE workflow
│   ├── main.ts              # Entry point & trigger registration
│   ├── firebase.ts          # Firestore integration
│   ├── llm.ts               # AI risk assessment engine
│   ├── types.ts             # TypeScript definitions
│   └── cre-callbacks/       # CRE callback handlers
│       ├── http-callback/   # HTTP trigger handlers
│       └── log-callbacks/   # EVM event handlers
├── testing/                 # Test framework
│   ├── test-*.js           # Test modules
│   ├── payloads/           # Test data
│   └── test-reports/       # Generated reports
├── cli-simulations/        # CLI simulation commands
└── docs/                   # Documentation
```

## 🔄 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- Follow the existing code style and patterns
- Add comprehensive tests for new functionality
- Update documentation if needed
- Ensure all tests pass locally

### 3. Test Your Changes

```bash
# Run linting and tests
npm run test:all

# Test CRE simulation
cre workflow simulate ./aegis-workflow

# Test specific functionality
npm run test:firebase
npm run test:authorize
npm run test:secure-increment
```

### 4. Submit a Pull Request

- **Clear title**: Describe what your PR does
- **Detailed description**: Explain the problem and solution
- **Test evidence**: Include test results or screenshots
- **Breaking changes**: Clearly mark any breaking changes

## 🎯 Areas for Contribution

### High Priority

1. **Additional LLM Providers**: Support for Claude, Llama, etc.
2. **Advanced Fraud Detection**: More sophisticated ML models
3. **Performance Optimization**: Reduce latency and gas costs
4. **Multi-chain Support**: Expand beyond Ethereum

### Medium Priority

1. **Enhanced Testing**: More comprehensive test scenarios
2. **Monitoring & Alerting**: Better observability tools
3. **Documentation**: More examples and tutorials
4. **Developer Tools**: CLI utilities and debugging helpers

### Community Contributions

1. **Bug Reports**: Clear reproduction steps and environment details
2. **Feature Requests**: Well-defined requirements and use cases
3. **Documentation**: Improvements to setup guides and API docs
4. **Examples**: Real-world integration examples

## 🐛 Bug Reports

When reporting bugs, please include:

- **Environment**: OS, Node.js version, CRE CLI version
- **Configuration**: Anonymized config (remove secrets)
- **Steps to reproduce**: Clear, step-by-step instructions
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Logs**: Relevant error messages or CRE engine logs

### Bug Report Template

````
**Environment:**
- OS: [e.g., Ubuntu 22.04]
- Node.js: [e.g., v20.10.0]
- CRE CLI: [e.g., v1.2.3]

**Configuration:**
- Firebase Project: [project-id]
- LLM Provider: [gemini/openai]
- Network: [ethereum-testnet-sepolia]

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Logs:**
```js
[Insert error logs here]
````

**Additional Context:**
[Any other relevant information]

```

## 🛠️ Development Guidelines

### Code Style

- Use 2 spaces for indentation
- Maximum line length of 100 characters
- Use meaningful variable and function names
- Prefer explicit types over inference where clarity improves

### Commit Messages

Follow conventional commits format:

```

feat: add support for Claude LLM provider
fix: resolve Firebase timeout in high-volume scenarios
docs: update Firebase setup guide with troubleshooting
test: add comprehensive secure increment test cases

````

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### Function Documentation

```typescript
/**
 * Assesses payment risk using LLM analysis of transaction history.
 *
 * @param runtime - CRE runtime instance with config and secrets
 * @param details - Risk assessment details including payload and history
 * @returns LLM response with risk decision and confidence score
 *
 * @example
 * ```typescript
 * const assessment = assessPaymentRisk(runtime, {
 *   payload: secureIncrementPayload,
 *   history: recentTransactions
 * });
 *
 * if (assessment.result === "YES") {
 *   // Proceed with authorization
 * }
 * ```
 */
export const assessPaymentRisk = (
  runtime: Runtime<Config>,
  details: RiskAssessmentDetails
): LLMResponse => {
  // Implementation...
};
````

## 🔍 Testing Guidelines

### Test Categories

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test component interactions
3. **Workflow Tests**: Test complete CRE workflows
4. **LLM Tests**: Test AI decision logic with various inputs

### Test Data Management

- Use realistic but anonymized test data
- Include edge cases and error scenarios
- Test both approval and rejection paths
- Validate error handling and timeouts

### Performance Testing

- Test with high-volume transaction scenarios
- Measure LLM response times
- Validate Firebase query performance
- Monitor memory usage during long runs

## 📚 Documentation Guidelines

### README Updates

When adding features, update:

- Feature descriptions
- Configuration examples
- CLI command examples
- Architecture diagrams if needed

### Code Comments

- Explain **why**, not just **what**
- Document security considerations
- Note any performance implications
- Reference related functions or external docs

### API Documentation

- Document all public interfaces
- Include request/response examples
- Note rate limits or usage constraints
- Provide error code explanations

## 🏆 Recognition

Contributors will be recognized in:

- Repository README contributor section
- Release notes for significant contributions
- AegisPay blog posts for major features
- Conference talks and presentations

## 🤝 Community

- **Discord**: [AegisPay Community](https://discord.gg/aegispay) _(Coming Soon)_
- **GitHub Discussions**: Use for questions and brainstorming
- **Issues**: Use for bug reports and feature requests
- **Pull Requests**: Use for code contributions


