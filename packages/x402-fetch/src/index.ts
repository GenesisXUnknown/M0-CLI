import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  privateKeyToAccount,
  type Address,
  type WalletClient,
} from "viem";
import { base, mainnet, arbitrum, optimism } from "viem/chains";
import {
  TRANSFER_WITH_AUTHORIZATION_TYPE,
  generateNonce,
  DEFAULT_TTL_SECONDS,
} from "@m0/x402-core";

// ─── Chain mapping ─────────────────────────────────────────────────────────────

const CHAIN_MAP = { base, ethereum: mainnet, arbitrum, optimism } as const;
type SupportedChain = keyof typeof CHAIN_MAP;

const ERC20_NAME_ABI = parseAbi(["function name() view returns (string)"]);

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PreferredToken {
  name: string;
  address: Address;
  chain: SupportedChain;
}

export interface M0ClientConfig {
  /**
   * viem WalletClient OR a raw 0x-prefixed private key string.
   * The private key is used to sign EIP-712 payment authorizations.
   */
  wallet: WalletClient | `0x${string}`;
  preferredToken: PreferredToken;
  /** Symbol or address of a fallback token if preferred is not accepted */
  fallbackToken?: string;
  /** Maximum payment per request — safety cap (e.g. "$1.00") */
  maxPayment?: string;
  /** Automatically sign payments under maxPayment without prompting */
  autoApprove?: boolean;
  /** Custom RPC URL for on-chain reads */
  rpcUrl?: string;
}

// ─── PAYMENT-REQUIRED header payload ─────────────────────────────────────────

interface PaymentRequired {
  scheme: string;
  network: SupportedChain;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  accepts: string[];
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createM0Client(config: M0ClientConfig) {
  const maxUnits = parsePrice(config.maxPayment ?? "$10.00");

  // Resolve wallet client
  let walletClient: WalletClient;
  if (typeof config.wallet === "string") {
    const account = privateKeyToAccount(config.wallet);
    walletClient = createWalletClient({
      account,
      chain: CHAIN_MAP[config.preferredToken.chain],
      transport: http(config.rpcUrl),
    });
  } else {
    walletClient = config.wallet;
  }

  return {
    /**
     * Drop-in replacement for `fetch`.
     * On a 402 response, automatically signs a payment and retries.
     */
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const res = await fetch(url, init);
      if (res.status !== 402) return res;

      const header = res.headers.get("payment-required");
      if (!header) return res;

      let req: PaymentRequired;
      try {
        req = JSON.parse(Buffer.from(header, "base64").toString()) as PaymentRequired;
      } catch {
        return res; // Malformed header — return the 402
      }

      // Check if we accept one of the offered tokens
      const accepts: string[] = req.accepts ?? [];
      const chosenName = accepts.find(
        (a) =>
          a.toLowerCase() === config.preferredToken.name.toLowerCase() ||
          a.toLowerCase() === config.preferredToken.address.toLowerCase()
      ) ??
        (config.fallbackToken &&
          accepts.find(
            (a) => a.toLowerCase() === config.fallbackToken!.toLowerCase()
          ));

      if (!chosenName) {
        return res; // We don't hold any accepted token
      }

      // Check cost is within our cap
      const cost = parsePrice(req.maxAmountRequired);
      if (cost > maxUnits) {
        console.warn(
          `[m0-fetch] Payment ${req.maxAmountRequired} exceeds cap ${config.maxPayment} — skipping`
        );
        return res;
      }

      if (!config.autoApprove) {
        console.warn("[m0-fetch] Payment required but autoApprove is disabled");
        return res;
      }

      // ── Sign the EIP-3009 TransferWithAuthorization ──────────────────────
      try {
        const chain = CHAIN_MAP[req.network ?? config.preferredToken.chain];
        const publicClient = createPublicClient({
          chain,
          transport: http(config.rpcUrl),
        });

        // Fetch the token's EIP-712 name from contract
        const tokenName = await publicClient
          .readContract({
            address: config.preferredToken.address,
            abi: ERC20_NAME_ABI,
            functionName: "name",
          })
          .catch(() => config.preferredToken.name);

        const domain = {
          name: tokenName as string,
          version: "1",
          chainId: chain.id,
          verifyingContract: config.preferredToken.address,
        };

        const now = BigInt(Math.floor(Date.now() / 1000));
        const nonce = generateNonce();
        const amount = parseUnits(
          req.maxAmountRequired.replace(/[$,]/g, ""),
          6 // M0 extensions use 6 decimals
        );

        const message = {
          from: walletClient.account!.address,
          to: req.payTo,
          value: amount,
          validAfter: 0n,
          validBefore: now + DEFAULT_TTL_SECONDS,
          nonce,
        };

        const signature = await walletClient.signTypedData({
          domain,
          types: TRANSFER_WITH_AUTHORIZATION_TYPE,
          primaryType: "TransferWithAuthorization",
          message,
        });

        const paymentPayload = Buffer.from(
          JSON.stringify({
            token: config.preferredToken.address,
            amount: amount.toString(),
            from: walletClient.account!.address,
            to: req.payTo,
            signature,
            nonce,
            validAfter: "0",
            validBefore: (now + DEFAULT_TTL_SECONDS).toString(),
            scheme: "exact",
            network: req.network ?? config.preferredToken.chain,
          })
        ).toString("base64");

        return fetch(url, {
          ...init,
          headers: { ...(init?.headers ?? {}), "X-PAYMENT": paymentPayload },
        });
      } catch (e: unknown) {
        console.error(
          `[m0-fetch] Payment signing failed: ${e instanceof Error ? e.message : String(e)}`
        );
        return res;
      }
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a dollar amount string ("$1.23") to integer cents */
function parsePrice(p: string): number {
  return Math.round(parseFloat(p.replace(/[$,]/g, "")) * 100);
}
