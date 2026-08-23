import type { Plugin } from "@elizaos/core";

/**
 * @bridgenode/plugin-x402 — pay-per-request LLM inference via x402 on Solana USDC.
 *
 * Full implementation lands in Phase 2 (x402 signer + AI SDK provider + actions).
 * This scaffold keeps the package buildable and importable from day one.
 */
export const bridgenodePlugin: Plugin = {
	name: "@bridgenode/plugin-x402",
	description:
		"Pay-per-request LLM inference via x402 on Solana USDC — no API keys, no accounts",
	actions: [],
	providers: [],
	services: [],
	models: {},
};

export default bridgenodePlugin;
