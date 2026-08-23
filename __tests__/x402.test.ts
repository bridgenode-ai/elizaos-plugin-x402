import { describe, expect, it } from "vitest";

import { createSignerFromPrivateKey, getX402Config } from "../src/x402.js";

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
				BRIDGENODE_BASE_URL: "https://custom.base/",
				BRIDGENODE_MAX_USDC_PER_TX: 2.5,
			}),
		);
		expect(cfg.privateKey).toBe("abc");
		expect(cfg.rpcUrl).toBe("https://custom.rpc");
		expect(cfg.baseUrl).toBe("https://custom.base/");
		expect(cfg.maxUsdcPerTx).toBe(2.5);
	});
});
