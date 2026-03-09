/**
 * M0 Protocol GraphQL API client.
 *
 * The public GraphQL endpoint is not yet documented — queries here are shaped
 * to match what the protocol returns based on the known data model.
 * If a query fails, callers should degrade gracefully (the CLI still works
 * with only on-chain data).
 */

const M0_API_URL = "https://api.m0.xyz/graphql";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtensionStats {
  /** Unique holder count */
  holders: number;
  /** Total value locked in USD */
  tvlUsd: string;
  /** Cumulative M tokens minted through this extension */
  totalMinted: string;
  /** 24h volume USD */
  dailyVolumeUsd: string;
}

export interface EarnerApprovalStatus {
  /** "pending" | "approved" | "rejected" */
  status: string;
  /** TTG proposal ID (if submitted) */
  proposalId?: string;
  /** Estimated epoch when voting ends */
  votingEndsEpoch?: number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function gqlFetch<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(M0_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };

    if (json.errors?.length) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchExtensionStats(
  contractAddress: string,
  chainId: number
): Promise<ExtensionStats | null> {
  type Response = {
    extension: {
      holdersCount: number;
      tvlUsd: string;
      totalMinted: string;
      dailyVolumeUsd: string;
    } | null;
  };

  const data = await gqlFetch<Response>(
    `query ExtensionStats($address: String!, $chainId: Int!) {
       extension(address: $address, chainId: $chainId) {
         holdersCount
         tvlUsd
         totalMinted
         dailyVolumeUsd
       }
     }`,
    { address: contractAddress.toLowerCase(), chainId }
  );

  const ext = data?.extension;
  if (!ext) return null;

  return {
    holders: ext.holdersCount,
    tvlUsd: ext.tvlUsd,
    totalMinted: ext.totalMinted,
    dailyVolumeUsd: ext.dailyVolumeUsd,
  };
}

export async function fetchEarnerApprovalStatus(
  contractAddress: string,
  chainId: number
): Promise<EarnerApprovalStatus | null> {
  type Response = {
    earnerApplication: {
      status: string;
      proposalId: string | null;
      votingEndsEpoch: number | null;
    } | null;
  };

  const data = await gqlFetch<Response>(
    `query EarnerStatus($address: String!, $chainId: Int!) {
       earnerApplication(address: $address, chainId: $chainId) {
         status
         proposalId
         votingEndsEpoch
       }
     }`,
    { address: contractAddress.toLowerCase(), chainId }
  );

  const app = data?.earnerApplication;
  if (!app) return null;

  return {
    status: app.status,
    proposalId: app.proposalId ?? undefined,
    votingEndsEpoch: app.votingEndsEpoch ?? undefined,
  };
}
