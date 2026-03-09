# @m0/x402-core

Core library for M0 Extension payment verification and settlement via the x402 protocol.

## Features

- **M0Facilitator** — Verifies M0 Extension token payments and routes settlement through SwapFacility
- Supports cross-Extension atomic swaps (e.g. AgentUSD → wM) via the SwapFacility proxy
- Balance verification via on-chain reads (viem)

## Usage

```typescript
import { M0Facilitator } from "@m0/x402-core";

const facilitator = new M0Facilitator({
  rpcUrl: "https://mainnet.base.org",
  chain: "base",
  supportedExtensions: [
    { name: "AgentUSD", symbol: "aUSD", address: "0x...", chain: "base", chainId: 8453 },
  ],
});

const result = await facilitator.verifyPayment({
  token: "aUSD",
  amount: 1000000n, // 1 aUSD (6 decimals)
  from: "0x...",
  signature: "0x...",
});
```

## SwapFacility

The SwapFacility (`0xB6807116b3B1B321a390594e31ECD6e0076f6278`) is deployed at the same address on all supported chains and enables atomic 1:1 swaps between any two M0 Extensions.
