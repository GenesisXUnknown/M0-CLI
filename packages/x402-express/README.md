# @m0/x402-express

Express middleware for accepting M0 Extension token payments via the x402 protocol (HTTP 402 Payment Required).

## Usage

```typescript
import express from "express";
import { m0PaymentMiddleware } from "@m0/x402-express";

const app = express();

app.use(
  m0PaymentMiddleware({
    routes: {
      "GET /api/weather": {
        price: "$0.001",
        accepts: ["AgentUSD", "wM"],
        description: "Weather data feed",
      },
    },
    seller: {
      treasury: "0xYourTreasuryAddress",
      preferredToken: "wM",
      autoSwap: true,
    },
    facilitator: {
      rpcUrl: process.env.BASE_RPC_URL!,
      chain: "base",
    },
  })
);

app.get("/api/weather", (req, res) => {
  res.json({ temperature: 72, conditions: "sunny" });
});

app.listen(3000);
```

## Flow

1. Request arrives without `X-PAYMENT` header → `402 Payment Required` + `PAYMENT-REQUIRED` header with payment details
2. Client submits request with `X-PAYMENT` header (base64-encoded signed payload)
3. Middleware verifies payment via `@m0/x402-core`
4. If valid → request proceeds; if invalid → `402` again
