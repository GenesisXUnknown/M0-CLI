# M0 CLI — Developer Toolkit for M0 Stablecoin Extensions + x402 Agent Payments

## Project Overview

Build `m0-cli`, a Node.js/TypeScript command-line tool that lets developers scaffold, configure, deploy, and manage M0 Extension stablecoins — and plug them into the x402 agentic payments protocol. Think "Create React App" for stablecoins meets an x402 facilitator SDK.

The CLI wraps M0's existing Foundry/Forge smart contract templates so developers never have to touch Solidity directly for standard use cases. The default Extension model is **MYieldToOne** (treasury model), where all yield streams to a single wallet address.

## Architecture

```
m0-cli/
├── CLAUDE.md                    # This file
├── package.json
├── tsconfig.json
├── bin/
│   └── m0.ts                    # CLI entry point
├── src/
│   ├── commands/                # CLI commands
│   │   ├── init.ts              # Scaffold new Extension project
│   │   ├── configure.ts         # Interactive config wizard
│   │   ├── deploy.ts            # Deploy Extension contracts
│   │   ├── status.ts            # Check Extension status (yield, holders, earner approval)
│   │   ├── yield.ts             # Yield management (enable, claim, stream)
│   │   ├── bridge.ts            # Cross-chain bridging
│   │   └── governance.ts        # Earner approval submission + tracking
│   ├── templates/               # Solidity contract templates
│   │   ├── MYieldToOne.sol.hbs  # Treasury model (default)
│   │   ├── MYieldFee.sol.hbs    # User yield model
│   │   ├── MEarnerManager.sol.hbs # Institutional model
│   │   ├── DeployExtension.s.sol.hbs  # Forge deploy script template
│   │   └── foundry.toml.hbs    # Foundry config template
│   ├── x402/                    # x402 integration layer
│   │   ├── facilitator.ts       # M0 Extension facilitator for x402
│   │   ├── middleware.ts        # Express/Hono middleware for accepting M0 Extension payments
│   │   └── client.ts           # Fetch client for paying with M0 Extensions
│   ├── lib/
│   │   ├── config.ts            # Project config management (.m0/config.json)
│   │   ├── chains.ts            # Supported chain configs + contract addresses
│   │   ├── graphql.ts           # M0 Protocol GraphQL API client
│   │   ├── contracts.ts         # Contract interaction helpers (ethers.js / viem)
│   │   ├── forge.ts             # Forge CLI wrapper
│   │   └── logger.ts            # Styled console output
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── packages/
│   ├── x402-express/            # npm: @m0/x402-express
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts         # Express middleware for x402 + M0 Extensions
│   │   └── README.md
│   ├── x402-fetch/              # npm: @m0/x402-fetch
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts         # Fetch client for agents paying with M0 Extensions
│   │   └── README.md
│   └── x402-core/               # npm: @m0/x402-core
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── facilitator.ts   # Payment verification + settlement via SwapFacility
│       │   ├── types.ts         # Shared x402 types
│       │   └── swap.ts          # SwapFacility interaction for cross-Extension settlement
│       └── README.md
└── test/
    ├── commands/                # Unit tests for CLI commands
    ├── x402/                    # x402 integration tests
    └── fixtures/                # Test fixtures (mock configs, contract ABIs)
```

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **CLI Framework:** Commander.js
- **Prompts:** @inquirer/prompts (for interactive config wizard)
- **Blockchain:** viem (for contract interactions, NOT ethers.js — M0's codebase uses viem patterns)
- **Templates:** Handlebars (for Solidity template generation)
- **HTTP:** express (for x402 server middleware)
- **Testing:** vitest
- **Build:** tsup (for bundling CLI + packages)
- **Monorepo:** npm workspaces

## Core Reference: M0 Protocol

### Contract Addresses (Critical — use these exact addresses)

**SwapFacility Proxy (same address across all chains):** `0xB6807116b3B1B321a390594e31ECD6e0076f6278`

**$M Token:**
- Ethereum: `0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b`

**Wrapped $M (wM):**
- Ethereum: `0x437cc33344a0B27A429f795ff6B469C72698B291`

**Supported Chains for Extensions:**
- Ethereum (chainId: 1)
- Base (chainId: 8453)
- Arbitrum (chainId: 42161)
- Optimism (chainId: 10)
- BSC (chainId: 56)
- Linea (chainId: 59144)
- HyperEVM (chainId: 999)
- Plume (chainId: 98865)

**Testnets:**
- Sepolia (chainId: 11155111)
- Base Sepolia (chainId: 84532)
- Arbitrum Sepolia (chainId: 421614)
- Optimism Sepolia (chainId: 11155420)

### M0 GraphQL API

Endpoint for querying protocol state: use the M0 Protocol API (GraphQL).
Base pattern: query for extension holders, TVL, yield accrued, earner status.

### Extension Models

**MYieldToOne (Treasury Model — DEFAULT):**
- All yield goes to a single configurable `yieldRecipient` address
- Includes blacklist enforcement on all user actions
- Handles loss of $M earner status gracefully
- Key functions: `claimYield()`, `enableEarning()`, `disableEarning()`
- This is the recommended model for x402/agent use cases

**MYieldFee (User Yield Model):**
- All users receive the same yield rate, discounted by a global `feeRate`
- Yield can be redirected via `claimRecipient` per user
- Functions: `updateIndex()`, `claimFor(address)`

**MEarnerManager (Institutional Model):**
- Redistributes yield to all holders minus per-address `feeRate`
- Enforces a whitelist; non-whitelisted users are frozen
- Functions: `claimFor(address)`

### Extension Base Contract Interface

All extensions inherit from `MExtension` and must implement:

```solidity
wrap(address recipient, uint256 amount)   // Convert $M to extension token
unwrap(address recipient, uint256 amount) // Convert extension token back to $M
```

Only the SwapFacility contract is authorized to call wrap/unwrap.

### SwapFacility Interface

The SwapFacility is the exclusive router for all wrapping and swapping:

```solidity
swap(address fromExtension, address toExtension, address recipient, uint256 amount)
swapInM(address extension, address recipient, uint256 amount)    // $M → Extension
swapOutM(address extension, address recipient, uint256 amount)   // Extension → $M
```

This is critical for the x402 facilitator: an agent paying with ExtensionA can pay a seller who wants ExtensionB, and SwapFacility handles the atomic swap.

### EVM Extensions GitHub Repo

Source: `https://github.com/m0-foundation/evm-m-extensions`
- Foundry/Forge project
- Contract templates in `src/`
- Deploy scripts in `script/`
- Uses `forge script` for deployment
- Requires `.env` with PRIVATE_KEY, RPC URLs, ETHERSCAN_API_KEY

## Command Specifications

### `m0 init <name>`

Scaffolds a new Extension project.

```bash
m0 init myUSD
m0 init myUSD --model yield-to-one --chain base
m0 init myUSD --model yield-fee --chain ethereum
```

**Options:**
- `--model <model>` — Extension model: `yield-to-one` (default), `yield-fee`, `earner-manager`
- `--chain <chain>` — Target chain: `base` (default), `ethereum`, `arbitrum`, `optimism`, etc.
- `--invite <code>` — Optional BD pre-approval invite code (for fast-tracked earner approval)

**What it does:**
1. Creates project directory with:
   - `foundry.toml` (generated from template with correct remappings)
   - `src/MyExtension.sol` (generated from selected model template)
   - `script/Deploy.s.sol` (deployment script)
   - `test/MyExtension.t.sol` (basic test suite)
   - `.m0/config.json` (project metadata)
   - `.env.example`
   - `README.md`
2. Runs `forge install` to pull M0 dependencies
3. Prompts for initial configuration (or defers to `m0 configure`)

**Config file (`.m0/config.json`):**

```json
{
  "name": "myUSD",
  "symbol": "mYUSD",
  "model": "yield-to-one",
  "chain": "base",
  "chainId": 8453,
  "treasury": null,
  "admin": null,
  "blacklistAdmin": null,
  "deployed": false,
  "contractAddress": null,
  "earnerStatus": "not-submitted",
  "inviteCode": null
}
```

### `m0 configure`

Interactive configuration wizard using @inquirer/prompts.

**Prompts for:**
- Token name (e.g., "My Stablecoin")
- Token symbol (e.g., "mYUSD")
- Treasury wallet address (yield recipient — this is the dev's revenue address)
- Admin address (contract admin, defaults to deployer)
- Blacklist admin address (defaults to admin)
- RPC URL (if not in .env)
- Deployer private key reference (points to .env, NEVER stored in config)

**Validates:**
- All addresses are valid checksummed Ethereum addresses
- Treasury address is not zero address
- RPC URL is reachable

Updates `.m0/config.json` with validated values.

### `m0 deploy`

Deploys the Extension contract.

```bash
m0 deploy                        # Deploy to configured chain
m0 deploy --network base-sepolia # Deploy to testnet
m0 deploy --dry-run              # Simulate deployment
m0 deploy --verify               # Verify on block explorer
```

**What it does:**
1. Reads `.m0/config.json` and `.env`
2. Compiles contracts via `forge build`
3. Runs deploy script via `forge script`
4. Records deployed contract address in `.m0/config.json`
5. Optionally verifies on Etherscan/Basescan
6. Prints deployment summary with explorer links

### `m0 status`

Checks Extension status.

```bash
m0 status
```

**Output:**

```
┌─────────────────────────────────────────────┐
│  myUSD (mYUSD)                              │
│  Chain: Base                                │
│  Contract: 0x1234...5678                    │
│  Explorer: https://basescan.org/address/... │
├─────────────────────────────────────────────┤
│  Earner Status: ✅ APPROVED                 │
│  Earning: ENABLED                           │
│  Yield Accrued: 1,234.56 $M                │
│  Treasury: 0xABC...DEF                      │
│  Total Supply: 50,000 mYUSD                │
│  Holders: 127                               │
│  TVL: $50,000                               │
└─────────────────────────────────────────────┘
```

Queries M0 GraphQL API + on-chain contract reads.

### `m0 yield`

Yield management subcommands.

```bash
m0 yield enable                  # Call enableEarning() on contract
m0 yield disable                 # Call disableEarning()
m0 yield claim                   # Claim accrued yield to treasury
m0 yield claim --to 0x...        # Claim to specific address (if supported)
m0 yield info                    # Show current yield rate, accrued, last claim
```

### `m0 governance`

Earner approval management.

```bash
m0 governance apply-earner       # Submit earner approval application
m0 governance status             # Check approval status
```

**`apply-earner` collects and submits:**
- Contract address
- Extension model type
- Chain
- Deployer/admin identity
- Audit status (if applicable)
- Invite code (if available, for fast-tracking)

### `m0 bridge`

Cross-chain bridging (wraps M Portal).

```bash
m0 bridge --from base --to arbitrum --amount 1000
m0 bridge status <txHash>
```

## x402 Integration Packages

### @m0/x402-core

Core library for M0 Extension payment verification and settlement.

```typescript
// src/facilitator.ts
export class M0Facilitator {
  constructor(config: {
    rpcUrl: string;
    swapFacilityAddress: string;  // 0xB680...
    supportedExtensions: ExtensionConfig[];
    signerOrProvider: any;
  })
  // Verify a payment payload contains valid M0 Extension token transfer
  async verifyPayment(payload: x402PaymentPayload): Promise<VerificationResult>
  // Settle payment — if buyer pays with ExtensionA but seller wants ExtensionB,
  // route through SwapFacility automatically
  async settlePayment(payload: x402PaymentPayload, sellerPreference: string): Promise<SettlementResult>
  // Check if a token address is a valid M0 Extension
  async isM0Extension(tokenAddress: string): Promise<boolean>
}

// src/swap.ts
export class SwapRouter {
  // Route a swap between any two M0 Extensions via SwapFacility
  async swap(params: {
    fromExtension: string;
    toExtension: string;
    amount: bigint;
    recipient: string;
  }): Promise<TransactionReceipt>
  // Get the best route (direct swap vs through $M)
  async getRoute(fromExtension: string, toExtension: string): Promise<SwapRoute>
}

// src/types.ts
export interface ExtensionConfig {
  name: string;           // "AgentUSD"
  symbol: string;         // "aUSD"
  address: string;        // Contract address
  chain: string;          // "base"
  chainId: number;        // 8453
}

export interface x402PaymentPayload {
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}
```

### @m0/x402-express

Express middleware for accepting M0 Extension payments via x402.

```typescript
// Usage example:
import express from 'express';
import { m0PaymentMiddleware } from '@m0/x402-express';

const app = express();

app.use(m0PaymentMiddleware({
  // Route-level pricing
  routes: {
    "GET /api/weather": {
      price: "$0.001",
      accepts: ["AgentUSD", "mUSD", "USDN", "wM"],
      description: "Weather data feed"
    },
    "POST /api/inference": {
      price: "$0.01",
      accepts: ["AgentUSD"],
      description: "AI inference endpoint"
    }
  },
  // Seller config
  seller: {
    treasury: "0xABC...",           // Where payments land
    preferredToken: "wM",           // Preferred settlement token
    autoSwap: true                  // Auto-swap incoming tokens to preferred
  },
  // M0 facilitator config
  facilitator: {
    rpcUrl: process.env.RPC_URL,
    chain: "base"
  }
}));

app.get('/api/weather', (req, res) => {
  // This only executes if payment was verified
  res.json({ temperature: 72, conditions: "sunny" });
});
```

**Middleware behavior:**
1. Request comes in without payment → respond `402 Payment Required` with M0 Extension payment options in `PAYMENT-REQUIRED` header
2. Request comes in with `PAYMENT-SIGNATURE` header → verify payment via M0Facilitator
3. If payment token differs from seller's preferred token → route through SwapFacility
4. If valid → pass to next middleware. If invalid → respond `402`.

### @m0/x402-fetch

Fetch client for agents paying with M0 Extensions.

```typescript
// Usage example:
import { createM0Client } from '@m0/x402-fetch';

const client = createM0Client({
  wallet: agentWallet,              // viem WalletClient or private key
  preferredToken: {
    name: "AgentUSD",
    address: "0x...",
    chain: "base"
  },
  fallbackToken: "wM",             // Fallback if seller doesn't accept preferred
  maxPayment: "$1.00",             // Safety cap per request
  autoApprove: true                // Auto-sign payments under maxPayment
});

// Transparent payment — if endpoint returns 402, client auto-pays and retries
const response = await client.fetch("https://api.weather.com/forecast");
const data = await response.json();
```

## Implementation Order

Build in this sequence:

### Phase 1: CLI Core (build first)
1. Project scaffolding (`bin/m0.ts`, Commander setup)
2. `m0 init` — template generation with Handlebars
3. `m0 configure` — interactive prompts
4. `src/lib/config.ts` — config file management
5. `src/lib/chains.ts` — chain configs with addresses
6. `src/templates/` — Solidity templates for all 3 models

### Phase 2: Deploy + Status
1. `src/lib/forge.ts` — Forge CLI wrapper
2. `m0 deploy` — compilation + deployment
3. `src/lib/contracts.ts` — viem contract interaction
4. `src/lib/graphql.ts` — M0 API client
5. `m0 status` — on-chain reads + API queries

### Phase 3: Yield + Governance
1. `m0 yield` — enable, claim, info subcommands
2. `m0 governance` — earner application flow
3. `m0 bridge` — portal integration

### Phase 4: x402 Packages
1. `@m0/x402-core` — facilitator + swap router
2. `@m0/x402-express` — server middleware
3. `@m0/x402-fetch` — agent client

### Phase 5: Testing
1. Unit tests for all commands (mock forge, mock chain)
2. Integration tests for x402 flow (local hardhat/anvil)
3. E2E test: init → configure → deploy → enable earning → x402 payment

## Key Technical Decisions

- **viem over ethers.js** — aligns with M0's existing patterns and modern TypeScript
- **Commander over yargs/oclif** — lightweight, well-documented, good TypeScript support
- **Handlebars for Solidity templates** — clean separation of template logic from Solidity code
- **Monorepo with npm workspaces** — CLI + x402 packages ship independently
- **MYieldToOne as default** — simplest model, best fit for agent/x402 use cases, single treasury address captures all yield
- **SwapFacility as the x402 settlement backbone** — enables cross-Extension payment routing without external DEX dependency

## Testing Strategy

- Use `anvil` (Foundry's local testnet) for contract deployment tests
- Mock the Forge CLI for unit tests of `m0 deploy`
- Use vitest with proper TypeScript support
- Create fixtures for contract ABIs, mock configs, and expected deployment outputs
- For x402 tests: spin up a local Express server with middleware, simulate 402 flow

## Environment Variables

The CLI should look for these in `.env` or environment:

```
PRIVATE_KEY=0x...              # Deployer private key
RPC_URL=https://...            # Default RPC URL
ETHERSCAN_API_KEY=...          # For contract verification
M0_API_KEY=...                 # M0 GraphQL API key (if required)
```

## Error Handling

- All commands should have clear, actionable error messages
- Failed deployments should dump forge output for debugging
- Network errors should suggest checking RPC URL
- Missing config should point to `m0 configure`
- Use chalk for colored terminal output (red errors, green success, yellow warnings)

## Important Constraints

- NEVER store private keys in config files — only reference .env
- NEVER commit .env files — always generate .gitignore
- Contract templates must match the EXACT interface of M0's audited contracts — do not invent new Solidity
- The x402 facilitator must be compatible with the existing x402 spec (HTTP 402, PAYMENT-REQUIRED header, PAYMENT-SIGNATURE header)
- All chain addresses must match the deployed SwapFacility addresses from M0's GitHub
