import type { WalletClient } from "viem";

export interface PreferredToken {
  name: string;
  address: string;
  chain: string;
}

export interface M0ClientConfig {
  wallet: WalletClient | string;
  preferredToken: PreferredToken;
  fallbackToken?: string;
  maxPayment?: string;
  autoApprove?: boolean;
}

export function createM0Client(config: M0ClientConfig) {
  const maxCents = parsePrice(config.maxPayment ?? "$10.00");

  return {
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const res = await fetch(url, init);
      if (res.status !== 402) return res;

      const header = res.headers.get("payment-required");
      if (!header) return res;

      let req: {
        accepts?: string[];
        maxAmountRequired?: string;
      };
      try {
        req = JSON.parse(Buffer.from(header, "base64").toString());
      } catch {
        return res;
      }

      const accepts: string[] = req.accepts ?? [];
      const token = accepts.includes(config.preferredToken.name)
        ? config.preferredToken.name
        : config.fallbackToken && accepts.includes(config.fallbackToken)
        ? config.fallbackToken
        : null;

      if (!token) return res;

      const cost = parsePrice(req.maxAmountRequired ?? "$0");
      if (cost > maxCents) {
        console.warn(
          `[m0] Payment ${req.maxAmountRequired} exceeds max ${config.maxPayment}`
        );
        return res;
      }

      if (!config.autoApprove) {
        console.warn("[m0] Payment required, auto-approve disabled");
        return res;
      }

      const walletAddress =
        typeof config.wallet === "string"
          ? config.wallet
          : config.wallet.account?.address;

      // TODO: EIP-712 signing
      const payload = Buffer.from(
        JSON.stringify({
          token: config.preferredToken.address,
          amount: req.maxAmountRequired,
          from: walletAddress,
          signature: "0x_TODO",
          scheme: "exact",
          network: config.preferredToken.chain,
        })
      ).toString("base64");

      return fetch(url, {
        ...init,
        headers: { ...init?.headers, "X-PAYMENT": payload },
      });
    },
  };
}

function parsePrice(p: string): number {
  return Math.round(parseFloat(p.replace(/[$,]/g, "")) * 100);
}
