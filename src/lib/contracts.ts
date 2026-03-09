import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  privateKeyToAccount,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  optimism,
  type Chain,
} from "viem/chains";

// ─── Chain mapping ────────────────────────────────────────────────────────────

const VIEM_CHAINS: Record<string, Chain> = {
  ethereum: mainnet,
  sepolia,
  base,
  "base-sepolia": baseSepolia,
  arbitrum,
  optimism,
};

export function getViemChain(networkName: string): Chain {
  const chain = VIEM_CHAINS[networkName];
  if (!chain)
    throw new Error(
      `No viem chain for: "${networkName}". Supported: ${Object.keys(VIEM_CHAINS).join(", ")}`
    );
  return chain;
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

/** Minimal M token ABI — functions used by the CLI */
export const M_TOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  // Earner functions
  "function isEarning(address account) view returns (bool)",
  "function accruedYieldOf(address account) view returns (uint240)",
  "function currentEarnerRate() view returns (uint32)",
  // EIP-3009 — gasless transfers used by x402
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

/** MYieldToOne extension ABI — the primary model for x402/agent use */
export const EXTENSION_ABI = parseAbi([
  // ERC20 standard
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  // MYieldToOne — yield control
  "function enableEarning() external",
  "function disableEarning() external",
  "function claimYield() external returns (uint240 yield_)",
  "function yieldRecipient() view returns (address)",
  "function admin() view returns (address)",
  // EIP-3009 — gasless transfers used by x402
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

/** TTG Registrar ABI — check earner/minter approval status */
export const TTG_REGISTRAR_ABI = parseAbi([
  "function listContains(bytes32 listName, address account) view returns (bool)",
]);

/**
 * keccak256("earners") — the list key in TTGRegistrar.
 * Source: https://github.com/m0-foundation/ttg/blob/main/src/libs/Lists.sol
 */
export const EARNER_LIST_KEY =
  "0x06deb0c5289b197f0d2c0b10f1e98c75e70dd37ae0d7a4a6e4862c28c6d9b89c" as const;

// ─── Client factories ─────────────────────────────────────────────────────────

export function createClient(
  rpcUrl: string,
  networkName: string
): PublicClient {
  return createPublicClient({
    chain: getViemChain(networkName),
    transport: http(rpcUrl),
  });
}

export function createSigningClient(
  rpcUrl: string,
  networkName: string,
  privateKey: `0x${string}`
): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: getViemChain(networkName),
    transport: http(rpcUrl),
  });
}

// ─── Yield info ───────────────────────────────────────────────────────────────

export interface YieldInfo {
  /** Is the extension earning yield from the M token protocol? */
  isEarning: boolean;
  /** Current earner rate (M protocol basis points, scaled 1e12) */
  earnerRate: bigint;
  /** Unclaimed yield accrued to this extension (M token base units) */
  accruedYield: bigint;
  /** Extension's M token balance (= TVL) */
  mBalance: bigint;
  /** Extension's own total supply */
  totalSupply: bigint;
  /** Where yield is sent on claimYield() */
  yieldRecipient: Address;
}

export async function fetchYieldInfo(
  extensionAddress: Address,
  mTokenAddress: Address,
  client: PublicClient
): Promise<YieldInfo> {
  const [isEarning, accruedYield, earnerRate, totalSupply, mBalance, yieldRecipient] =
    await Promise.all([
      client
        .readContract({
          address: mTokenAddress,
          abi: M_TOKEN_ABI,
          functionName: "isEarning",
          args: [extensionAddress],
        })
        .catch(() => false as boolean),

      client
        .readContract({
          address: mTokenAddress,
          abi: M_TOKEN_ABI,
          functionName: "accruedYieldOf",
          args: [extensionAddress],
        })
        .catch(() => 0n),

      client
        .readContract({
          address: mTokenAddress,
          abi: M_TOKEN_ABI,
          functionName: "currentEarnerRate",
        })
        .catch(() => 0),

      client
        .readContract({
          address: extensionAddress,
          abi: EXTENSION_ABI,
          functionName: "totalSupply",
        })
        .catch(() => 0n),

      client
        .readContract({
          address: mTokenAddress,
          abi: M_TOKEN_ABI,
          functionName: "balanceOf",
          args: [extensionAddress],
        })
        .catch(() => 0n),

      client
        .readContract({
          address: extensionAddress,
          abi: EXTENSION_ABI,
          functionName: "yieldRecipient",
        })
        .catch(
          () => "0x0000000000000000000000000000000000000000" as Address
        ),
    ]);

  return {
    isEarning: isEarning as boolean,
    earnerRate: BigInt(earnerRate as number),
    accruedYield: accruedYield as bigint,
    mBalance: mBalance as bigint,
    totalSupply: totalSupply as bigint,
    yieldRecipient: yieldRecipient as Address,
  };
}

/** Check if an extension is approved as an earner in TTG */
export async function isRegisteredEarner(
  extensionAddress: Address,
  ttgRegistrarAddress: Address,
  client: PublicClient
): Promise<boolean> {
  return client
    .readContract({
      address: ttgRegistrarAddress,
      abi: TTG_REGISTRAR_ABI,
      functionName: "listContains",
      args: [EARNER_LIST_KEY, extensionAddress],
    })
    .catch(() => false);
}

// ─── Write helpers ────────────────────────────────────────────────────────────

export async function txEnableEarning(
  extensionAddress: Address,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    address: extensionAddress,
    abi: EXTENSION_ABI,
    functionName: "enableEarning",
    account: walletClient.account!,
  });
  return walletClient.writeContract(request);
}

export async function txDisableEarning(
  extensionAddress: Address,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    address: extensionAddress,
    abi: EXTENSION_ABI,
    functionName: "disableEarning",
    account: walletClient.account!,
  });
  return walletClient.writeContract(request);
}

export async function txClaimYield(
  extensionAddress: Address,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    address: extensionAddress,
    abi: EXTENSION_ABI,
    functionName: "claimYield",
    account: walletClient.account!,
  });
  return walletClient.writeContract(request);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format M token amount (6 decimals) as a human-readable string */
export function formatM(amount: bigint, decimals = 6): string {
  return parseFloat(formatUnits(amount, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

/**
 * Format M0 earner rate to APY %.
 * The protocol stores rate as basis points scaled by 1e12 (per second, annualized).
 * Divide by 1e10 to get a rough percentage display.
 */
export function formatEarnerRate(rate: bigint): string {
  const rateNum = Number(rate) / 1e10;
  return `${rateNum.toFixed(2)}% APY`;
}
