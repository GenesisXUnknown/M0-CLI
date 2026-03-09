# @m0/x402-fetch

Drop-in fetch wrapper for AI agents that automatically handles x402 payment flows using M0 Extension tokens.

## Usage

```typescript
import { createM0Client } from "@m0/x402-fetch";

const client = createM0Client({
  wallet: "0xYourWalletAddress", // or a viem WalletClient
  preferredToken: {
    name: "AgentUSD",
    address: "0x...",
    chain: "base",
  },
  fallbackToken: "wM",
  maxPayment: "$1.00",
  autoApprove: true,
});

// Automatically pays if the endpoint returns 402
const res = await client.fetch("https://api.example.com/data");
const data = await res.json();
```

## Flow

1. Makes the initial request
2. If `402 Payment Required` + `PAYMENT-REQUIRED` header → parses payment requirements
3. Checks if preferred or fallback token is accepted
4. If cost ≤ `maxPayment` and `autoApprove: true` → signs and retries with `X-PAYMENT` header
5. Returns the final response
