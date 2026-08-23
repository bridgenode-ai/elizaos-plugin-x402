import { describe, expect, it } from "vitest";

import { createTextHandler } from "../src/provider.js";

// Live integration test (Phase 3.4, S3 approved: few cents, money stays with us).
// Requires TEST_WALLET_PK in env — loads from /root/BridgeNode/.env when run
// locally. Skipped when the key is absent (CI must NOT see the secret).
const TEST_WALLET_PK = process.env.TEST_WALLET_PK ?? "";

function fakeRuntime() {
	return {
		getSetting: (key: string) => {
			const map: Record<string, string> = {
				SOLANA_PRIVATE_KEY: TEST_WALLET_PK,
				SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
				BRIDGENODE_BASE_URL: "https://bridgenode.cc/v1",
				BRIDGENODE_MAX_USDC_PER_TX: "1",
				BRIDGENODE_MODEL_SMALL: "deepseek-v4-flash",
			};
			return map[key] ?? undefined;
		},
	} as never;
}

describe.skipIf(!TEST_WALLET_PK)("live integration (real payment)", () => {
	it("non-stream: pays and returns text from BridgeNode", async () => {
		const handler = createTextHandler("small");
		const result = await handler(fakeRuntime(), {
			prompt: "Reply with exactly: OK",
			maxTokens: 16,
		});
		expect(typeof result).toBe("string");
		expect(result).toContain("OK");
	}, 120_000);

	it("stream: pays and streams chunks", async () => {
		const handler = createTextHandler("small");
		const result = (await handler(fakeRuntime(), {
			prompt: "Reply with exactly: OK",
			maxTokens: 16,
			stream: true,
		})) as Awaited<ReturnType<typeof handler>> & {
			textStream: AsyncIterable<string>;
		};
		let full = "";
		for await (const chunk of result.textStream) {
			full += chunk;
		}
		expect(full).toContain("OK");
	}, 120_000);
});
