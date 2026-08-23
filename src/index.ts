import type { Plugin } from "@elizaos/core";

/**
 * @bridgenode/plugin-x402 — pay-per-request LLM inference via x402 on Solana USDC.
 *
 * Manifest (Phase 2.1). Model handlers land in 2.2–2.5, actions in 2.6.
 *
 * priority: 100 — wins over OpenAI/Anthropic model providers (same pattern as
 * elizaos-plugin-solanacloud). ⚠️ Conflict risk: any OTHER plugin with
 * priority 100 becomes a tie; document in README ("only one priority-100
 * model provider per character").
 */
export const bridgenodePlugin: Plugin = {
	name: "@bridgenode/plugin-x402",
	description:
		"Pay-per-request LLM inference via x402 on Solana USDC — no API keys, no accounts, gas sponsored",
	priority: 100,
	// 2.2: ModelType registration — TEXT_SMALL, TEXT_LARGE
	// (MEDIUM = alias to TEXT_LARGE in eliza 1.x — not registered separately)
	models: {},
	// 2.6: actions — getPriceEstimate (live /v1/models pricing)
	actions: [],
	providers: [],
	services: [],
};

export default bridgenodePlugin;
