import {
  createPublicClient,
  http,
  type Address,
  parseAbi,
} from "viem";
import { base, mainnet, arbitrum, optimism } from "viem/chains";
import type { ExtensionConfig, VerificationResult, SettlementResult } from "./types.js";

const SWAP_FACILITY = "0xB6807116b3B1B321a390594e31ECD6e0076f6278" as Address;

const EXTENSION_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

const CHAIN_MAP = { base, ethereum: mainnet, arbitrum, optimism };

export interface M0FacilitatorConfig {
  rpcUrl: string;
  chain: keyof typeof CHAIN_MAP;
  supportedExtensions: ExtensionConfig[];
}

export class M0Facilitator {
  private client: ReturnType<typeof createPublicClient>;
  private extensions: Map<string, ExtensionConfig>;

  constructor(config: M0FacilitatorConfig) {
    this.client = createPublicClient({
      chain: CHAIN_MAP[config.chain],
      transport: http(config.rpcUrl),
    });
    this.extensions = new Map();
    for (const ext of config.supportedExtensions) {
      this.extensions.set(ext.address.toLowerCase(), ext);
      this.extensions.set(ext.symbol.toLowerCase(), ext);
    }
  }

  async verifyPayment(payload: {
    token: string;
    amount: bigint;
    from: string;
    signature: string;
  }): Promise<VerificationResult> {
    const ext = this.extensions.get(payload.token.toLowerCase());
    if (!ext) {
      return {
        valid: false,
        error: `Token ${payload.token} is not a recognized M0 Extension`,
      };
    }

    try {
      const balance = await this.client.readContract({
        address: ext.address as Address,
        abi: EXTENSION_ABI,
        functionName: "balanceOf",
        args: [payload.from as Address],
      });
      if (balance < payload.amount) {
        return { valid: false, error: "Insufficient balance" };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, error: `Balance check failed: ${msg}` };
    }

    // TODO: Verify EIP-712 signature
    return { valid: true, extension: ext };
  }

  async settlePayment(params: {
    fromToken: string;
    toToken: string;
    amount: bigint;
    recipient: string;
  }): Promise<SettlementResult> {
    const from = this.extensions.get(params.fromToken.toLowerCase());
    const to = this.extensions.get(params.toToken.toLowerCase());
    if (!from || !to) return { success: false, error: "Unknown extension" };

    if (from.address === to.address) {
      return { success: true, method: "direct", fromExtension: from, toExtension: to };
    }

    // Different extensions — route through SwapFacility (atomic, 1:1, no slippage)
    return {
      success: true,
      method: "swap",
      fromExtension: from,
      toExtension: to,
      swapFacility: SWAP_FACILITY,
    };
  }

  getSupportedExtensions(): ExtensionConfig[] {
    const seen = new Set<string>();
    const result: ExtensionConfig[] = [];
    for (const [, ext] of this.extensions) {
      if (!seen.has(ext.address)) {
        seen.add(ext.address);
        result.push(ext);
      }
    }
    return result;
  }
}
