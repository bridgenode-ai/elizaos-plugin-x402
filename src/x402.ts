import {
	createKeyPairSignerFromBytes,
	getBase58Encoder,
	type KeyPairSigner,
} from "@solana/kit";

/**
 * x402 helpers (Phase 2.3–2.4).
 *
 * 2.3: SOLANA_PRIVATE_KEY (base58) → @solana/kit KeyPairSigner.
 * Conversion boundary: eliza's @solana/web3.js v1 Keypair is NOT used —
 * the x402 SDK and this plugin speak @solana/kit (v2) types, so the signer
 * must be created via createKeyPairSignerFromBytes (async, Web Crypto).
 *
 * 2.4 (next): x402Client + ExactSvmScheme + wrapFetchWithPayment.
 */

/**
 * Convert a base58 Solana private key into a @solana/kit KeyPairSigner.
 *
 * @param privateKeyBase58 - base58-encoded 64-byte secret key
 * @returns KeyPairSigner ready for x402 ExactSvmScheme
 */
export async function createSignerFromPrivateKey(
	privateKeyBase58: string,
): Promise<KeyPairSigner> {
	const bytes = getBase58Encoder().encode(privateKeyBase58);
	return createKeyPairSignerFromBytes(bytes);
}

/**
 * Resolve config from character settings (via runtime) or env, ElizaOS-style.
 */
export interface X402Config {
	privateKey: string;
	rpcUrl: string;
	baseUrl: string;
	maxUsdcPerTx: number;
}

export function getX402Config(
	settings: {
		getSetting?: (key: string) => string | undefined;
	} | null = null,
): X402Config {
	const get = (key: string): string | undefined =>
		settings?.getSetting?.(key) ?? process.env[key];

	const privateKey = get("SOLANA_PRIVATE_KEY");
	if (!privateKey) {
		throw new Error(
			"SOLANA_PRIVATE_KEY is required — set it in character settings.secrets or .env",
		);
	}

	return {
		privateKey,
		rpcUrl:
			get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
		baseUrl: get("BRIDGENODE_BASE_URL") ?? "https://bridgenode.cc/v1",
		maxUsdcPerTx: Number(
			get("BRIDGENODE_MAX_USDC_PER_TX") ?? "1",
		),
	};
}
