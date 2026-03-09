export interface ExtensionConfig {
  name: string;
  symbol: string;
  address: string;
  chain: string;
  chainId: number;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  extension?: ExtensionConfig;
}

export interface SettlementResult {
  success: boolean;
  error?: string;
  method?: "direct" | "swap";
  fromExtension?: ExtensionConfig;
  toExtension?: ExtensionConfig;
  swapFacility?: string;
  txHash?: string;
}
