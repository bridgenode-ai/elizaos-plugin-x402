import type { Plugin } from "@elizaos/core";
import { ModelType } from "@elizaos/core";

import { createTextHandler } from "./provider.js";
import { getPriceEstimate } from "./actions/getPriceEstimate.js";

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
	// 2.2: ModelType registration — TEXT_SMALL, TEXT_LARGE.
	// (1.x: MEDIUM is an alias of TEXT_LARGE — not registered separately.
	// BridgeNode has no embedding models (checked 08-23) — TEXT_EMBEDDING skipped.)
	models: {
		[ModelType.TEXT_SMALL]: createTextHandler("small"),
		[ModelType.TEXT_LARGE]: createTextHandler("large"),
	},
	// 2.6: actions — getPriceEstimate (live /v1/models pricing)
	actions: [getPriceEstimate],
	providers: [],
	services: [],
};

export default bridgenodePlugin;
