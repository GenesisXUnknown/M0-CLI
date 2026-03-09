import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  recoverTypedDataAddress,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { base, mainnet, arbitrum, optimism } from "viem/chains";
import type { ExtensionConfig, VerificationResult, SettlementResult } from "./types.js";
import {
  TRANSFER_WITH_AUTHORIZATION_TYPE,
  type TransferAuthorizationMessage,
  type Eip712Domain,
} from "./eip712.js";
import { SWAP_FACILITY_ADDRESS, SWAP_FACILITY_ABI } from "./swap.js";

// ─── ERC20 ABI subset ─────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  // EIP-3009
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

// ─── Chain map ────────────────────────────────────────────────────────────────

const CHAIN_MAP = { base, ethereum: mainnet, arbitrum, optimism } as const;
type SupportedChain = keyof typeof CHAIN_MAP;

// ─── x402 payment payload ─────────────────────────────────────────────────────

export interface X402PaymentPayload {
  /** Token contract address */
  token: Address;
  /** Amount in token base units */
  amount: bigint;
  /** Payer address */
  from: Address;
  /** Recipient address */
  to: Address;
  /** EIP-712 signature */
  signature: `0x${string}`;
  /** EIP-3009 nonce */
  nonce: `0x${string}`;
  /** UNIX timestamp — payment not valid before this time */
  validAfter: bigint;
  /** UNIX timestamp — payment expires after this time */
  validBefore: bigint;
  /** Chain name (e.g. "base") */
  network: SupportedChain;
}

// ─── Facilitator ─────────────────────────────────────────────────────────────

export interface M0FacilitatorConfig {
  rpcUrl: string;
  chain: SupportedChain;
  supportedExtensions: ExtensionConfig[];
  /** Optional wallet for settlement transactions */
  settlerPrivateKey?: `0x${string}`;
}

export class M0Facilitator {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private extensions: Map<string, ExtensionConfig>;
  private chain: SupportedChain;

  constructor(config: M0FacilitatorConfig) {
    const viemChain = CHAIN_MAP[config.chain];
    this.chain = config.chain;

    this.publicClient = createPublicClient({
      chain: viemChain,
      transport: http(config.rpcUrl),
    });

    if (config.settlerPrivateKey) {
      const { privateKeyToAccount } = await import("viem").then(
        (m) => m
      );
      void privateKeyToAccount; // imported dynamically below
    }

    this.extensions = new Map();
    for (const ext of config.supportedExtensions) {
      this.extensions.set(ext.address.toLowerCase(), ext);
      this.extensions.set(ext.symbol.toLowerCase(), ext);
      this.extensions.set(ext.name.toLowerCase(), ext);
    }
  }

  // ─── Verify ──────────────────────────────────────────────────────────────

  /**
   * Verify a payment payload:
   * 1. Token is a recognized M0 Extension
   * 2. EIP-712 signature recovers to the `from` address
   * 3. Payment has not expired
   * 4. Payer has sufficient balance
   * 5. Nonce hasn't been used
   */
  async verifyPayment(payload: X402PaymentPayload): Promise<VerificationResult> {
    // 1. Recognize token
    const ext = this.extensions.get(payload.token.toLowerCase());
    if (!ext) {
      return {
        valid: false,
        error: `Token ${payload.token} is not a recognized M0 Extension`,
      };
    }

    // 2. Check expiry
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < payload.validAfter) {
      return { valid: false, error: "Payment not yet valid" };
    }
    if (now > payload.validBefore) {
      return { valid: false, error: "Payment has expired" };
    }

    // 3. Recover EIP-712 signer
    try {
      const tokenName = await this.publicClient
        .readContract({
          address: payload.token,
          abi: ERC20_ABI,
          functionName: "name",
        })
        .catch(() => ext.name);

      const domain: Eip712Domain = {
        name: tokenName as string,
        version: "1",
        chainId: CHAIN_MAP[this.chain].id,
        verifyingContract: payload.token,
      };

      const message: TransferAuthorizationMessage = {
        from: payload.from,
        to: payload.to,
        value: payload.amount,
        validAfter: payload.validAfter,
        validBefore: payload.validBefore,
        nonce: payload.nonce,
      };

      const recovered = await recoverTypedDataAddress({
        domain,
        types: TRANSFER_WITH_AUTHORIZATION_TYPE,
        primaryType: "TransferWithAuthorization",
        message,
        signature: payload.signature,
      });

      if (recovered.toLowerCase() !== payload.from.toLowerCase()) {
        return { valid: false, error: "Signature does not match `from` address" };
      }
    } catch (e: unknown) {
      return {
        valid: false,
        error: `Signature verification failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 4. Check balance
    try {
      const balance = await this.publicClient.readContract({
        address: payload.token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [payload.from],
      });
      if ((balance as bigint) < payload.amount) {
        return { valid: false, error: "Insufficient token balance" };
      }
    } catch (e: unknown) {
      return {
        valid: false,
        error: `Balance check failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 5. Check nonce not used
    try {
      const used = await this.publicClient.readContract({
        address: payload.token,
        abi: ERC20_ABI,
        functionName: "authorizationState",
        args: [payload.from, payload.nonce],
      });
      if (used) {
        return { valid: false, error: "Nonce already used" };
      }
    } catch {
      // authorizationState not supported on this token — skip check
    }

    return { valid: true, extension: ext };
  }

  // ─── Settle ───────────────────────────────────────────────────────────────

  /**
   * Settle a verified payment:
   * - If buyer and seller want the same Extension → call transferWithAuthorization
   * - If different Extensions → route through SwapFacility
   *
   * Requires `settlerPrivateKey` in config.
   */
  async settlePayment(
    payload: X402PaymentPayload,
    sellerPreferredToken: string
  ): Promise<SettlementResult> {
    if (!this.walletClient) {
      return {
        success: false,
        error:
          "No settler wallet configured. Pass settlerPrivateKey to M0FacilitatorConfig.",
      };
    }

    const from = this.extensions.get(payload.token.toLowerCase());
    const to = this.extensions.get(sellerPreferredToken.toLowerCase());

    if (!from) {
      return { success: false, error: `Unknown from-token: ${payload.token}` };
    }
    if (!to) {
      return {
        success: false,
        error: `Unknown preferred token: ${sellerPreferredToken}`,
      };
    }

    try {
      // Same extension — simple transferWithAuthorization
      if (from.address.toLowerCase() === to.address.toLowerCase()) {
        const { request } = await this.publicClient.simulateContract({
          address: payload.token,
          abi: ERC20_ABI,
          functionName: "transferWithAuthorization",
          args: [
            payload.from,
            payload.to,
            payload.amount,
            payload.validAfter,
            payload.validBefore,
            payload.nonce,
            payload.signature,
          ],
          account: this.walletClient.account!,
        });
        const txHash = await this.walletClient.writeContract(request);
        return {
          success: true,
          method: "direct",
          fromExtension: from,
          toExtension: to,
          txHash,
        };
      }

      // Different extensions — transferWithAuthorization to SwapFacility, then swap
      // Step 1: Transfer from payer → SwapFacility
      const { request: transferReq } = await this.publicClient.simulateContract(
        {
          address: payload.token,
          abi: ERC20_ABI,
          functionName: "transferWithAuthorization",
          args: [
            payload.from,
            SWAP_FACILITY_ADDRESS,
            payload.amount,
            payload.validAfter,
            payload.validBefore,
            payload.nonce,
            payload.signature,
          ],
          account: this.walletClient.account!,
        }
      );
      await this.walletClient.writeContract(transferReq);

      // Step 2: SwapFacility.swap(fromExt, toExt, recipient, amount)
      const { request: swapReq } = await this.publicClient.simulateContract({
        address: SWAP_FACILITY_ADDRESS,
        abi: SWAP_FACILITY_ABI,
        functionName: "swap",
        args: [
          from.address as Address,
          to.address as Address,
          payload.to,
          payload.amount,
        ],
        account: this.walletClient.account!,
      });
      const txHash = await this.walletClient.writeContract(swapReq);

      return {
        success: true,
        method: "swap",
        fromExtension: from,
        toExtension: to,
        swapFacility: SWAP_FACILITY_ADDRESS,
        txHash,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: `Settlement failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
