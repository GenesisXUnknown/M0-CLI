export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  explorerApi: string;
  swapFacility: string;
  mToken: string;
  wrappedM: string;
  isTestnet: boolean;
}

const SWAP_FACILITY = "0xB6807116b3B1B321a390594e31ECD6e0076f6278";

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    explorerApi: "https://api.etherscan.io/api",
    swapFacility: SWAP_FACILITY,
    mToken: "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b",
    wrappedM: "0x437cc33344a0B27A429f795ff6B469C72698B291",
    isTestnet: false,
  },
  base: {
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    explorerApi: "https://api.basescan.org/api",
    swapFacility: SWAP_FACILITY,
    mToken: "",
    wrappedM: "",
    isTestnet: false,
  },
  arbitrum: {
    name: "Arbitrum",
    chainId: 42161,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    explorerApi: "https://api.arbiscan.io/api",
    swapFacility: SWAP_FACILITY,
    mToken: "",
    wrappedM: "",
    isTestnet: false,
  },
  optimism: {
    name: "Optimism",
    chainId: 10,
    rpcUrl: "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    explorerApi: "https://api-optimistic.etherscan.io/api",
    swapFacility: SWAP_FACILITY,
    mToken: "",
    wrappedM: "",
    isTestnet: false,
  },
  "base-sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    explorerApi: "https://api-sepolia.basescan.org/api",
    swapFacility: SWAP_FACILITY,
    mToken: "",
    wrappedM: "",
    isTestnet: true,
  },
  sepolia: {
    name: "Sepolia",
    chainId: 11155111,
    rpcUrl: "https://rpc.sepolia.org",
    explorer: "https://sepolia.etherscan.io",
    explorerApi: "https://api-sepolia.etherscan.io/api",
    swapFacility: SWAP_FACILITY,
    mToken: "",
    wrappedM: "",
    isTestnet: true,
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAINS);
export const MAINNET_CHAINS = Object.entries(CHAINS)
  .filter(([, c]) => !c.isTestnet)
  .map(([k]) => k);
export const TESTNET_CHAINS = Object.entries(CHAINS)
  .filter(([, c]) => c.isTestnet)
  .map(([k]) => k);

export function getChain(name: string): ChainConfig {
  const chain = CHAINS[name];
  if (!chain)
    throw new Error(
      `Unsupported chain: ${name}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  return chain;
}
