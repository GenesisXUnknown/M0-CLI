import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";

/**
 * SwapFacility — deployed at the same address on all M0-supported chains.
 * The exclusive router for wrapping/swapping M0 Extensions.
 * Source: https://github.com/m0-foundation/evm-m-extensions
 */
export const SWAP_FACILITY_ADDRESS =
  "0xB6807116b3B1B321a390594e31ECD6e0076f6278" as Address;

export const SWAP_FACILITY_ABI = parseAbi([
  // $M → Extension (wrap)
  "function swapInM(address extension, address recipient, uint256 amount) external",
  // Extension → $M (unwrap)
  "function swapOutM(address extension, address recipient, uint256 amount) external",
  // Extension A → Extension B (atomic cross-extension swap)
  "function swap(address fromExtension, address toExtension, address recipient, uint256 amount) external",
]);

export interface SwapParams {
  fromExtension: Address;
  toExtension: Address;
  amount: bigint;
  recipient: Address;
}

export class SwapRouter {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient
  ) {}

  /**
   * Swap between two M0 Extensions atomically via SwapFacility.
   * 1:1 exchange, no slippage — all backed by the same underlying $M.
   */
  async swap(params: SwapParams): Promise<Hash> {
    const { request } = await this.publicClient.simulateContract({
      address: SWAP_FACILITY_ADDRESS,
      abi: SWAP_FACILITY_ABI,
      functionName: "swap",
      args: [
        params.fromExtension,
        params.toExtension,
        params.recipient,
        params.amount,
      ],
      account: this.walletClient.account!,
    });
    return this.walletClient.writeContract(request);
  }

  /** Wrap $M into an Extension token */
  async swapInM(params: {
    extension: Address;
    recipient: Address;
    amount: bigint;
  }): Promise<Hash> {
    const { request } = await this.publicClient.simulateContract({
      address: SWAP_FACILITY_ADDRESS,
      abi: SWAP_FACILITY_ABI,
      functionName: "swapInM",
      args: [params.extension, params.recipient, params.amount],
      account: this.walletClient.account!,
    });
    return this.walletClient.writeContract(request);
  }

  /** Unwrap an Extension token back to $M */
  async swapOutM(params: {
    extension: Address;
    recipient: Address;
    amount: bigint;
  }): Promise<Hash> {
    const { request } = await this.publicClient.simulateContract({
      address: SWAP_FACILITY_ADDRESS,
      abi: SWAP_FACILITY_ABI,
      functionName: "swapOutM",
      args: [params.extension, params.recipient, params.amount],
      account: this.walletClient.account!,
    });
    return this.walletClient.writeContract(request);
  }

  static fromRpc(
    rpcUrl: string,
    chain: Parameters<typeof createPublicClient>[0]["chain"],
    privateKey: `0x${string}`
  ): SwapRouter {
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account: { address: "0x0" as Address, type: "json-rpc" },
      chain,
      transport: http(rpcUrl),
    });
    // Proper account assignment done by caller; this is a convenience factory
    void privateKey; // used by caller to configure walletClient
    return new SwapRouter(publicClient, walletClient);
  }
}
