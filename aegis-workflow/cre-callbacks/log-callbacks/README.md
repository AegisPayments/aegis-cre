# Log Callbacks for EVM Event Monitoring

This folder contains CRE callback handlers for processing EVM log events from the Aegis protocol contract.

## Overview

The log callbacks enable the Aegis workflow to automatically capture and log important contract events to Firestore for audit trail and analytics purposes.

## Event Handlers

### Captured Funds (`captured-funds.ts`)

- **Event**: `Captured(address indexed user, address indexed merchant, uint256 amount)`
- **Trigger**: Fires when a merchant captures authorized funds from a user
- **Action**: Writes captured fund details to the `captured-logs` Firestore collection
- **Data logged**: user address, merchant address, amount, block number, transaction info

### Funds Released (`funds-released.ts`)

- **Event**: `FundsReleased(address indexed user, address indexed merchant, uint256 amount)`
- **Trigger**: Fires when remaining authorized funds are released back to the user
- **Action**: Writes funds released details to the `funds-released-logs` Firestore collection
- **Data logged**: user address, merchant address, amount, block number, transaction info

## Firestore Collections

The log callbacks create and write to two new Firestore collections:

- **`captured-logs`** - Records all fund capture events
- **`funds-released-logs`** - Records all fund release events

Each document contains:

- User and merchant addresses
- Transaction amount
- Blockchain metadata (block number, transaction hash)
- Timestamp of the log creation

## Configuration

The log triggers are configured in [`main.ts`](../main.ts) and use:

- The contract address from the first EVM configuration
- Finalized confidence level for maximum security
- Event signature hashes computed using keccak256

## Usage

The log callbacks are automatically triggered by CRE when the corresponding events are emitted from the Aegis protocol contract. No manual intervention is required - they run as part of the workflow's event monitoring system.

## Integration

These callbacks integrate with the existing Firebase infrastructure defined in [`firebase.ts`](../firebase.ts) and use the same authentication and write patterns as the existing HTTP-triggered functions.
