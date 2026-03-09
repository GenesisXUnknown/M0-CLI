import type { Request, Response, NextFunction } from "express";
import { M0Facilitator, type ExtensionConfig } from "@m0/x402-core";

export interface RoutePaymentConfig {
  price: string;
  accepts: string[];
  description: string;
}

export interface M0PaymentMiddlewareConfig {
  routes: Record<string, RoutePaymentConfig>;
  seller: {
    treasury: string;
    preferredToken: string;
    autoSwap: boolean;
  };
  facilitator: {
    rpcUrl: string;
    chain: "base" | "ethereum" | "arbitrum" | "optimism";
    extensions?: ExtensionConfig[];
  };
}

export function m0PaymentMiddleware(config: M0PaymentMiddlewareConfig) {
  const facilitator = new M0Facilitator({
    rpcUrl: config.facilitator.rpcUrl,
    chain: config.facilitator.chain,
    supportedExtensions: config.facilitator.extensions ?? [],
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method} ${req.path}`;
    const route = config.routes[routeKey];
    if (!route) return next();

    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      const encoded = Buffer.from(
        JSON.stringify({
          scheme: "exact",
          network: config.facilitator.chain,
          maxAmountRequired: route.price,
          resource: routeKey,
          description: route.description,
          payTo: config.seller.treasury,
          maxTimeoutSeconds: 60,
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

    try {
      const payload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString()
      ) as { token: string; amount: string; from: string; signature: string };

      const result = await facilitator.verifyPayment({
        token: payload.token,
        amount: BigInt(payload.amount),
        from: payload.from,
        signature: payload.signature,
      });

      if (!result.valid) {
        return res
          .status(402)
          .json({ error: "Verification failed", details: result.error });
      }

      (req as Request & { m0Payment: unknown }).m0Payment = {
        verified: true,
        extension: result.extension,
      };
      return next();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(402).json({ error: "Invalid payment", details: msg });
    }
  };
}

export { M0Facilitator } from "@m0/x402-core";
