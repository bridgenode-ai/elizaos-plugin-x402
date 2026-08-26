import {
	createKeyPairSignerFromBytes,
	getBase58Encoder,
	type KeyPairSigner,
} from "@solana/kit";
import { x402Client, type PaymentPolicy } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
	ExactSvmScheme,
	SOLANA_MAINNET_CAIP2,
	USDC_MAINNET_ADDRESS,
} from "@x402/svm";

/**
 * x402 helpers (Phase 2.3–2.4).
 *
 * 2.3: SOLANA_PRIVATE_KEY (base58) → @solana/kit KeyPairSigner.
 * 2.4: x402Client + ExactSvmScheme (Solana mainnet, USDC) + wrapFetchWithPayment
 *      + spend cap (S2: BRIDGENODE_MAX_USDC_PER_TX, default $1).
 *
 * S3 (0.1.5): fail-closed payment pins — the plugin never signs anything but
 * Solana-mainnet USDC paid to the configured BridgeNode wallet:
 *   - PaymentPolicy: network === SOLANA_MAINNET_CAIP2 AND asset ===
 *     USDC_MAINNET_ADDRESS AND payTo === config.payTo; any other asset
 *     (USDT/USDG/PYUSD/CASH), network, or recipient → throw, nothing signed.
 *   - Origin pin: BRIDGENODE_BASE_URL must be HTTPS on exactly
 *     bridgenode.cc (validated at config load, before any fetch is created).
 *
 * Conversion boundary: eliza's @solana/web3.js v1 Keypair is NOT used —
 * the x402 SDK and this plugin speak @solana/kit (v2) types, so the signer
 * must be created via createKeyPairSignerFromBytes (async, Web Crypto).
 */

/**
 * BridgeNode USDC receiving wallet (Solana mainnet). Payments are only ever
 * signed to this address unless BRIDGENODE_PAY_TO overrides it.
 */
export const BRIDGENODE_PAYTO_DEFAULT =
	"BHMDv3ri3LBEZjEzJgDZeUiguVX7LmsCstTXbM3dL8rN";

/** Allowed BRIDGENODE_BASE_URL host — exact match, no subdomains. */
export const BRIDGENODE_ALLOWED_HOST = "bridgenode.cc";

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
	payTo: string;
}

/**
 * Origin pin (S3): BRIDGENODE_BASE_URL must be HTTPS on exactly
 * `bridgenode.cc`. Throws before any fetch is created on:
 * - non-HTTPS schemes (`http://bridgenode.cc`, `ftp://…`)
 * - alternate hosts / subdomains (`evil.com`, `bridgenode.cc.evil.com`)
 *
 * Paths are allowed (`https://bridgenode.cc/v1`).
 */
export function validateBaseUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(
			`BRIDGENODE_BASE_URL must be a valid absolute URL (got "${raw}")`,
		);
	}
	if (url.protocol !== "https:") {
		throw new Error(
			`BRIDGENODE_BASE_URL must use HTTPS (got "${url.protocol}//${url.host}")`,
		);
	}
	if (url.hostname !== BRIDGENODE_ALLOWED_HOST) {
		throw new Error(
			`BRIDGENODE_BASE_URL host must be exactly ${BRIDGENODE_ALLOWED_HOST} (got "${url.hostname}")`,
		);
	}
	return raw;
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

	const baseUrl = validateBaseUrl(
		get("BRIDGENODE_BASE_URL") ?? "https://bridgenode.cc/v1",
	);

	return {
		privateKey,
		rpcUrl:
			get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
		baseUrl,
		maxUsdcPerTx: parseMaxUsdcPerTx(
			get("BRIDGENODE_MAX_USDC_PER_TX"),
		),
		payTo: get("BRIDGENODE_PAY_TO") ?? BRIDGENODE_PAYTO_DEFAULT,
	};
}

/**
 * Parse BRIDGENODE_MAX_USDC_PER_TX fail-closed (S2).
 *
 * - unset / blank → documented default $1 (cap stays ON)
 * - ONLY the exact canonical string "0" (untrimmed) disables the cap;
 *   whitespace-wrapped zeros (" 0 ", tab/newline-wrapped, NBSP-wrapped)
 *   are NOT the canonical "0" → they fail closed below
 * - any other value that parses or underflows to zero (e.g. "-0", "+0",
 *   "00", "0.0", "0e999", "0x0", "1e-324") → throws — a configuration
 *   typo must never silently disable the payment limit
 * - malformed (non-finite / non-numeric, e.g. "one") → throws
 * - negative → throws
 */
export function parseMaxUsdcPerTx(raw: string | undefined): number {
	const rawString =
		raw === undefined || raw === null ? "" : String(raw);
	// Explicit-disable check on the UNTRIMMED string: only the exact
	// canonical "0" may disable spend controls. Wrapped zeros fall through
	// to numeric parsing and are rejected by `parsed <= 0` below.
	if (rawString === "0") {
		return 0;
	}
	const value = rawString.trim();
	if (value === "") {
		return 1; // unset / blank → default $1
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(
			`BRIDGENODE_MAX_USDC_PER_TX must be a finite number (got "${raw}")`,
		);
	}
	// Catches negative values AND non-canonical zeros (including wrapped
	// zeros that trimmed to "0"): `parsed <= 0` is true for "-0", "+0",
	// "00", "0.0", "0e999", "0x0", "1e-324", " 0 " etc. (note "-0 < 0"
	// is false in JS, so a plain `< 0` check would miss it).
	if (parsed <= 0) {
		throw new Error(
			`BRIDGENODE_MAX_USDC_PER_TX must be > 0 (or exactly "0" to disable), got "${raw}"`,
		);
	}
	return parsed;
}

// ── x402 client (2.4) ──────────────────────────────────────────────────

/**
 * Fail-closed payment policy (S3): only Solana-mainnet USDC paid to the
 * configured BridgeNode wallet may be signed. Any requirement offering a
 * different network, a different asset (USDT/USDG/PYUSD/CASH — the other
 * @x402/svm mainnet defaults), or a different recipient → throws, so nothing
 * is signed.
 */
export function createUsdcPaymentPolicy(payTo: string): PaymentPolicy {
	return (
		_version: number,
		requirements: PaymentRequirements[],
	): PaymentRequirements[] => {
		for (const req of requirements) {
			const violations: string[] = [];
			if (req.network !== SOLANA_MAINNET_CAIP2) {
				violations.push(
					`network=${req.network} (expected ${SOLANA_MAINNET_CAIP2})`,
				);
			}
			if (req.asset !== USDC_MAINNET_ADDRESS) {
				violations.push(
					`asset=${req.asset} (expected USDC ${USDC_MAINNET_ADDRESS})`,
				);
			}
			if (req.payTo !== payTo) {
				violations.push(`payTo=${req.payTo} (expected ${payTo})`);
			}
			if (violations.length > 0) {
				throw new Error(
					`x402 payment rejected (fail-closed): ${violations.join("; ")}`,
				);
			}
		}
		return requirements;
	};
}

/**
 * Build a fetch wrapper that automatically pays x402 402 challenges:
 * 402 → sign → retry with PAYMENT-SIGNATURE. Spend cap applied per payment
 * (S2; default $1 — user configurable via BRIDGENODE_MAX_USDC_PER_TX).
 * Only Solana-mainnet USDC to the configured BridgeNode wallet is ever signed
 * (S3 payment policy).
 */
export async function createX402Fetch(config: X402Config): Promise<typeof fetch> {
	const signer = await createSignerFromPrivateKey(config.privateKey);
	const scheme = new ExactSvmScheme(signer, { rpcUrl: config.rpcUrl });
	// S2: user picks the cap (BRIDGENODE_MAX_USDC_PER_TX, default $1).
	// Only an explicit canonical 0 disables spend controls — getX402Config
	// validates the value fail-closed, so malformed input throws instead of
	// silently disabling the payment limit.
	const spendControls =
		config.maxUsdcPerTx > 0
			? { maxAmountPerPayment: String(config.maxUsdcPerTx) }
			: false;
	const client = x402Client.fromConfig({
		schemes: [{ network: SOLANA_MAINNET_CAIP2, client: scheme }],
		spendControls,
		// S3: refuse to sign anything that is not Solana-mainnet USDC paid
		// to the configured BridgeNode wallet.
		policies: [createUsdcPaymentPolicy(config.payTo)],
	});
	return wrapFetchWithPayment(fetch, client);
}
