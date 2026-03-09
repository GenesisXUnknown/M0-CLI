/**
 * EIP-3009 TransferWithAuthorization typed data definitions.
 *
 * M0 Extension tokens implement EIP-3009, enabling gasless payment transfers
 * where the payer signs an authorization and the facilitator submits it on-chain.
 *
 * Spec: https://eips.ethereum.org/EIPS/eip-3009
 */

export const TRANSFER_WITH_AUTHORIZATION_TYPE = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface TransferAuthorizationMessage {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

/** Generate a cryptographically random 32-byte nonce */
export function generateNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  ) as `0x${string}`;
}

/** Default payment TTL: 5 minutes */
export const DEFAULT_TTL_SECONDS = 300n;
