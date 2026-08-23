import {
	createKeyPairSignerFromBytes,
	getBase58Encoder,
	type KeyPairSigner,
} from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
	ExactSvmScheme,
	SOLANA_MAINNET_CAIP2,
} from "@x402/svm";

/**
 * x402 helpers (Phase 2.3–2.4).
 *
 * 2.3: SOLANA_PRIVATE_KEY (base58) → @solana/kit KeyPairSigner.
 * 2.4: x402Client + ExactSvmScheme (Solana mainnet, USDC) + wrapFetchWithPayment
 *      + spend cap (S2: BRIDGENODE_MAX_USDC_PER_TX, default $1).
 *
 * Conversion boundary: eliza's @solana/web3.js v1 Keypair is NOT used —
 * the x402 SDK and this plugin speak @solana/kit (v2) types, so the signer
 * must be created via createKeyPairSignerFromBytes (async, Web Crypto).
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
		getSetting?: (key: string) => string | number | boolean | null | undefined;
	} | null = null,
): X402Config {
	const get = (key: string): string | undefined => {
		const v = settings?.getSetting?.(key);
		if (v === undefined || v === null) return process.env[key];
		return String(v);
	};

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

// ── x402 client (2.4) ──────────────────────────────────────────────────

/**
 * Build a fetch wrapper that automatically pays x402 402 challenges:
 * 402 → sign → retry with PAYMENT-SIGNATURE. Spend cap applied per payment
 * (S2; default $1 — user configurable via BRIDGENODE_MAX_USDC_PER_TX).
 */
export async function createX402Fetch(config: X402Config): Promise<typeof fetch> {
	const signer = await createSignerFromPrivateKey(config.privateKey);
	const scheme = new ExactSvmScheme(signer, { rpcUrl: config.rpcUrl });
	// S2: user picks the cap (BRIDGENODE_MAX_USDC_PER_TX, default $1).
	// 0 / negative → spend controls fully disabled (user's explicit choice).
	const spendControls =
		config.maxUsdcPerTx > 0
			? { maxAmountPerPayment: String(config.maxUsdcPerTx) }
			: false;
	const client = x402Client.fromConfig({
		schemes: [{ network: SOLANA_MAINNET_CAIP2, client: scheme }],
		spendControls,
	});
	return wrapFetchWithPayment(fetch, client);
}
