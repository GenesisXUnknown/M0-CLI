export type ExtensionModel = "yield-to-one" | "yield-fee" | "earner-manager";
export type EarnerStatus = "not-submitted" | "pending" | "approved" | "rejected";

export interface M0ProjectConfig {
  name: string;
  symbol: string;
  model: ExtensionModel;
  chain: string;
  chainId: number;
  treasury: string | null;
  admin: string | null;
  blacklistAdmin: string | null;
  deployed: boolean;
  contractAddress: string | null;
  earnerStatus: EarnerStatus;
  inviteCode: string | null;
  deployedAt: string | null;
  deployTxHash: string | null;
}

export interface x402RouteConfig {
  price: string;
  accepts: string[];
  description: string;
}

export interface M0SellerConfig {
  treasury: string;
  preferredToken: string;
  autoSwap: boolean;
}
