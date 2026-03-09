import type { Request, Response, NextFunction } from "express";
import { M0Facilitator, type ExtensionConfig, type X402PaymentPayload } from "@m0/x402-core";

export interface RoutePaymentConfig {
  price: string;
  accepts: string[];
  description: string;
}

export interface M0PaymentMiddlewareConfig {
  routes: Record<string, RoutePaymentConfig>;
  seller: {
    /** Address where payments land */
    treasury: string;
    /** Preferred settlement token symbol (e.g. "wM") */
    preferredToken: string;
    /** Auto-swap incoming tokens to preferred via SwapFacility */
    autoSwap: boolean;
  };
  facilitator: {
    rpcUrl: string;
    chain: "base" | "ethereum" | "arbitrum" | "optimism";
    extensions?: ExtensionConfig[];
    /** Private key for settlement transactions (required for autoSwap) */
    settlerPrivateKey?: `0x${string}`;
  };
}

export function m0PaymentMiddleware(config: M0PaymentMiddlewareConfig) {
  const facilitator = new M0Facilitator({
    rpcUrl: config.facilitator.rpcUrl,
    chain: config.facilitator.chain,
    supportedExtensions: config.facilitator.extensions ?? [],
    settlerPrivateKey: config.facilitator.settlerPrivateKey,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method} ${req.path}`;
    const route = config.routes[routeKey];
    if (!route) return next();

    const paymentHeader = req.headers["x-payment"] as string | undefined;

    // ── No payment header → return 402 with payment requirements ──────────
    if (!paymentHeader) {
      const encoded = Buffer.from(
        JSON.stringify({
          scheme: "exact",
          network: config.facilitator.chain,
          maxAmountRequired: route.price,
          resource: routeKey,
          description: route.description,
          payTo: config.seller.treasury,
          maxTimeoutSeconds: 300,
          accepts: route.accepts,
        })
      ).toString("base64");

      res.setHeader("PAYMENT-REQUIRED", encoded);
      return res.status(402).json({
        error: "Payment Required",
        price: route.price,
        accepts: route.accepts,
      });
    }

    // ── Payment header present → verify ───────────────────────────────────
    try {
      const raw = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString()
      ) as Record<string, string>;

      const payload: X402PaymentPayload = {
        token: raw.token as `0x${string}`,
        amount: BigInt(raw.amount),
        from: raw.from as `0x${string}`,
        to: raw.to as `0x${string}`,
        signature: raw.signature as `0x${string}`,
        nonce: raw.nonce as `0x${string}`,
        validAfter: BigInt(raw.validAfter ?? "0"),
        validBefore: BigInt(raw.validBefore ?? String(Math.floor(Date.now() / 1000) + 300)),
        network: (raw.network as "base" | "ethereum" | "arbitrum" | "optimism") ?? config.facilitator.chain,
      };

      const verification = await facilitator.verifyPayment(payload);

      if (!verification.valid) {
        return res.status(402).json({
          error: "Payment verification failed",
          details: verification.error,
        });
      }

      // ── Settle payment ─────────────────────────────────────────────────
      if (config.seller.autoSwap) {
        const settlement = await facilitator.settlePayment(
          payload,
          config.seller.preferredToken
        );
        if (!settlement.success) {
          return res.status(402).json({
            error: "Payment settlement failed",
            details: settlement.error,
          });
        }
        (req as Request & { m0Payment: unknown }).m0Payment = {
          verified: true,
          settled: true,
          txHash: settlement.txHash,
          extension: verification.extension,
          method: settlement.method,
        };
      } else {
        (req as Request & { m0Payment: unknown }).m0Payment = {
          verified: true,
          settled: false,
          extension: verification.extension,
          payload,
        };
      }

      return next();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(402).json({ error: "Invalid payment payload", details: msg });
    }
  };
}

export { M0Facilitator } from "@m0/x402-core";
