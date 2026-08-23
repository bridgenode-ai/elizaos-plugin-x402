import { AgentRuntime, ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";

import { bridgenodePlugin } from "../src/index.js";

// ElizaOS runtime smoke (Phase 3.5): real AgentRuntime + our plugin +
// useModel → the plugin's priority-100 handler serves the call.
// Requires TEST_WALLET_PK in env (skipped in CI — secret never committed).
const TEST_WALLET_PK = process.env.TEST_WALLET_PK ?? "";

async function makeRuntime() {
	const runtime = new AgentRuntime({
		agentId: "00000000-0000-0000-0000-000000000001" as never,
		// getSetting() reads character.settings — required by the runtime.
		character: {
			name: "smoke-test",
			settings: {
				SOLANA_PRIVATE_KEY: TEST_WALLET_PK,
				SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
				BRIDGENODE_BASE_URL: "https://bridgenode.cc/v1",
				BRIDGENODE_MAX_USDC_PER_TX: "1",
				BRIDGENODE_MODEL_SMALL: "deepseek-v4-flash",
			},
		} as never,
		// logModelCall() requires an adapter (skips full initialize + DB).
		adapter: {
			log: async () => {},
		} as never,
	});
	// Models register via registerPlugin (not the constructor); initialize()
	// would require a DB adapter, so we register the plugin directly.
	await runtime.registerPlugin(bridgenodePlugin);
	return runtime;
}

describe.skipIf(!TEST_WALLET_PK)("ElizaOS runtime smoke", () => {
	it("useModel(TEXT_SMALL) is served by our plugin and returns text", async () => {
		const runtime = await makeRuntime();
		const text = (await runtime.useModel(ModelType.TEXT_SMALL, {
			prompt: "Reply with exactly: OK",
			maxTokens: 16,
		})) as string;
		expect(typeof text).toBe("string");
		expect(text).toContain("OK");
		await runtime.stop();
	}, 120_000);
});
