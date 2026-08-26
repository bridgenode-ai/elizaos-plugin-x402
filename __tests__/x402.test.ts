import { describe, expect, it } from "vitest";

import { SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from "@x402/svm";

import {
	BRIDGENODE_PAYTO_DEFAULT,
	createSignerFromPrivateKey,
	createUsdcPaymentPolicy,
	getX402Config,
	parseMaxUsdcPerTx,
	validateBaseUrl,
} from "../src/x402.js";

// Deterministic valid 64-byte base58 keypair (generated locally 08-23, not a live wallet)
const TEST_PRIVATE_KEY =
	"5s5SE6r86Kx4iW6vEiQWcVAvUezBr6QZgBvobFUyiJs4UPYFFuPnxypEge4a1Mpv4t3yoDyNaCH4cvcQE8sXq731";

describe("createSignerFromPrivateKey", () => {
	it("returns a KeyPairSigner with a base58 address", async () => {
		const signer = await createSignerFromPrivateKey(TEST_PRIVATE_KEY);
		expect(signer.address).toBeDefined();
		expect(signer.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
		expect(typeof signer.signMessages).toBe("function");
	});

	it("is deterministic — same key, same address", async () => {
		const a = await createSignerFromPrivateKey(TEST_PRIVATE_KEY);
		const b = await createSignerFromPrivateKey(TEST_PRIVATE_KEY);
		expect(a.address).toBe(b.address);
	});

	it("throws on invalid base58", async () => {
		await expect(createSignerFromPrivateKey("!!!not-base58!!!")).rejects.toThrow();
	});
});

describe("getX402Config", () => {
	const settingsWith = (overrides: Record<string, string | number | boolean | null>) => ({
		getSetting: (key: string) => overrides[key] ?? undefined,
	});

	it("throws when SOLANA_PRIVATE_KEY is missing", () => {
		expect(() => getX402Config(null)).toThrow(/SOLANA_PRIVATE_KEY/);
	});

	it("defaults rpc/base/max when only the key is set", () => {
		const cfg = getX402Config(settingsWith({ SOLANA_PRIVATE_KEY: "abc" }));
		expect(cfg.privateKey).toBe("abc");
		expect(cfg.rpcUrl).toBe("https://api.mainnet-beta.solana.com");
		expect(cfg.baseUrl).toBe("https://bridgenode.cc/v1");
		expect(cfg.maxUsdcPerTx).toBe(1);
	});

	it("reads settings with type coercion (number → string)", () => {
		const cfg = getX402Config(
			settingsWith({
				SOLANA_PRIVATE_KEY: "abc",
				SOLANA_RPC_URL: "https://custom.rpc",
				BRIDGENODE_BASE_URL: "https://bridgenode.cc/custom",
				BRIDGENODE_MAX_USDC_PER_TX: 2.5,
			}),
		);
		expect(cfg.privateKey).toBe("abc");
		expect(cfg.rpcUrl).toBe("https://custom.rpc");
		expect(cfg.baseUrl).toBe("https://bridgenode.cc/custom");
		expect(cfg.maxUsdcPerTx).toBe(2.5);
	});

	it("defaults payTo to the BridgeNode USDC wallet", () => {
		const cfg = getX402Config(settingsWith({ SOLANA_PRIVATE_KEY: "abc" }));
		expect(cfg.payTo).toBe(BRIDGENODE_PAYTO_DEFAULT);
	});

	it("reads BRIDGENODE_PAY_TO override", () => {
		const cfg = getX402Config(
			settingsWith({
				SOLANA_PRIVATE_KEY: "abc",
				BRIDGENODE_PAY_TO: "Recipient1111111111111111111111111111111111111",
			}),
		);
		expect(cfg.payTo).toBe("Recipient1111111111111111111111111111111111111");
	});

	it("rejects a non-bridgenode.cc base URL at config load", () => {
		expect(() =>
			getX402Config(
				settingsWith({
					SOLANA_PRIVATE_KEY: "abc",
					BRIDGENODE_BASE_URL: "https://evil.example/",
				BRIDGENODE_MAX_USDC_PER_TX: 1,
			}),
			),
		).toThrow(/must be exactly bridgenode\.cc/);
	});
});

describe("validateBaseUrl (origin pin)", () => {
	it("accepts the canonical HTTPS origin and paths", () => {
		expect(validateBaseUrl("https://bridgenode.cc")).toBe("https://bridgenode.cc");
		expect(validateBaseUrl("https://bridgenode.cc/v1")).toBe("https://bridgenode.cc/v1");
		expect(validateBaseUrl("https://bridgenode.cc/v1/models")).toBe(
			"https://bridgenode.cc/v1/models",
		);
	});

	it("rejects http:// on the same host (scheme downgrade)", () => {
		expect(() => validateBaseUrl("http://bridgenode.cc/v1")).toThrow(/must use HTTPS/);
	});

	it("rejects alternate hosts and subdomains", () => {
		expect(() => validateBaseUrl("https://evil.example/")).toThrow(/exactly bridgenode\.cc/);
		expect(() => validateBaseUrl("https://bridgenode.cc.evil.example/")).toThrow(
			/exactly bridgenode\.cc/,
		);
		expect(() => validateBaseUrl("https://api.bridgenode.cc/")).toThrow(
			/exactly bridgenode\.cc/,
		);
	});

	it("rejects non-URL values", () => {
		expect(() => validateBaseUrl("bridgenode.cc/v1")).toThrow(/valid absolute URL/);
		expect(() => validateBaseUrl("")).toThrow(/valid absolute URL/);
	});
});

describe("createUsdcPaymentPolicy (fail-closed payment policy)", () => {
	const PAY_TO = BRIDGENODE_PAYTO_DEFAULT;
	const USDT_MAINNET = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
	const USDG_MAINNET = "b1eLJj9hTwg2QvS9m2S5sQhG2hF4sQhG2hF4sQhG2hF4";

	const usdcReq = (overrides: Record<string, unknown> = {}) => ({
		scheme: "exact",
		network: SOLANA_MAINNET_CAIP2,
		asset: USDC_MAINNET_ADDRESS,
		amount: "1000000",
		payTo: PAY_TO,
		maxTimeoutSeconds: 60,
		extra: {},
		...overrides,
	});

	it("accepts a USDC mainnet requirement to the configured wallet", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		const req = usdcReq();
		expect(policy(2, [req])).toEqual([req]);
	});

	it("rejects USDT (default @x402/svm asset)", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		expect(() => policy(2, [usdcReq({ asset: USDT_MAINNET })])).toThrow(
			/fail-closed.*asset=/,
		);
	});

	it("rejects USDG / PYUSD / CASH-style assets (any non-USDC mint)", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		for (const asset of [USDG_MAINNET, "CASH-other-mint", "PYUSD-other-mint"]) {
			expect(() => policy(2, [usdcReq({ asset })])).toThrow(/fail-closed.*asset=/);
		}
	});

	it("rejects a wrong recipient (payTo mismatch)", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		expect(() =>
			policy(2, [
				usdcReq({ payTo: "SomeOtherWallet11111111111111111111111111111111" }),
			]),
		).toThrow(/fail-closed.*payTo=/);
	});

	it("rejects a non-mainnet network", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		expect(() =>
			policy(2, [usdcReq({ network: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY" })]),
		).toThrow(/fail-closed.*network=/);
	});

	it("rejects a mixed offer containing any non-USDC asset (nothing signed)", () => {
		const policy = createUsdcPaymentPolicy(PAY_TO);
		expect(() => policy(2, [usdcReq(), usdcReq({ asset: USDT_MAINNET })])).toThrow(
			/fail-closed/,
		);
	});
});

describe("parseMaxUsdcPerTx (fail-closed spend cap)", () => {
	it("defaults to 1 when unset", () => {
		expect(parseMaxUsdcPerTx(undefined)).toBe(1);
		expect(parseMaxUsdcPerTx(null as unknown as undefined)).toBe(1);
	});

	it("defaults to 1 for blank / whitespace (never disables on blank)", () => {
		expect(parseMaxUsdcPerTx("")).toBe(1);
		expect(parseMaxUsdcPerTx("   ")).toBe(1);
	});

	it("accepts a valid positive cap", () => {
		expect(parseMaxUsdcPerTx("2.5")).toBe(2.5);
		expect(parseMaxUsdcPerTx(" 3 ")).toBe(3);
	});

	it("allows explicit canonical 0 to disable the cap", () => {
		expect(parseMaxUsdcPerTx("0")).toBe(0);
	});

	it("rejects whitespace-wrapped zeros (only exact \"0\" disables)", () => {
		// Tab/newline/NBSP-wrapped "0" must NOT disable spend controls —
		// they are not the canonical string "0" and fail closed instead.
		for (const wrapped of [
			" 0 ",
			" 0",
			"0 ",
			"\t0",
			"0\t",
			"\n0\n",
			"\u00A00", // NBSP-wrapped
			"0\u00A0",
			"\u00A0 0 \u00A0",
		]) {
			expect(() => parseMaxUsdcPerTx(wrapped), JSON.stringify(wrapped)).toThrow(
				/> 0/,
			);
		}
	});

	it("rejects non-canonical zero values (only string \"0\" disables)", () => {
		for (const bad of ["-0", "+0", "00", "0.0", "0e999", "0x0", "1e-324"]) {
			expect(() => parseMaxUsdcPerTx(bad), bad).toThrow(/> 0/);
		}
	});

	it("rejects non-numeric values instead of silently disabling", () => {
		expect(() => parseMaxUsdcPerTx("one")).toThrow(/finite number/);
		expect(() => parseMaxUsdcPerTx("NaN")).toThrow(/finite number/);
		expect(() => parseMaxUsdcPerTx("Infinity")).toThrow(/finite number/);
	});

	it("rejects negative values (only canonical 0 disables)", () => {
		expect(() => parseMaxUsdcPerTx("-1")).toThrow(/> 0/);
		expect(() => parseMaxUsdcPerTx("-0.5")).toThrow(/> 0/);
	});
});
