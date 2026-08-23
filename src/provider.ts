import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
	GenerateTextParams,
	IAgentRuntime,
	PluginModelResult,
	TextStreamResult,
} from "@elizaos/core";
import { generateText, streamText } from "ai";

import {
	createX402Fetch,
	getX402Config,
	type X402Config,
} from "./x402.js";

// Model IDs are config-driven (DINAMIŠKUMO PRINCIPAS): env overridable,
// defaults verified live against https://bridgenode.cc/v1/models (2026-08-23).
const MODEL_SMALL_DEFAULT = "deepseek-v4-flash";
const MODEL_LARGE_DEFAULT = "glm-5.2";

interface ProviderBundle {
	fetch: typeof fetch;
	config: X402Config;
	modelSmall: string;
	modelLarge: string;
}

const bundleCache = new Map<string, Promise<ProviderBundle>>();

async function getProviderBundle(runtime: IAgentRuntime): Promise<ProviderBundle> {
	const config = getX402Config(runtime);
	const cacheKey = config.privateKey;
	let cached = bundleCache.get(cacheKey);
	if (!cached) {
		cached = (async () => {
			const x402Fetch = await createX402Fetch(config);
			const setting = (key: string): string | undefined => {
				const v = runtime.getSetting(key);
				return typeof v === "string" ? v : undefined;
			};
			return {
				fetch: x402Fetch,
				config,
				modelSmall:
					setting("BRIDGENODE_MODEL_SMALL") ??
					process.env.BRIDGENODE_MODEL_SMALL ??
					MODEL_SMALL_DEFAULT,
				modelLarge:
					setting("BRIDGENODE_MODEL_LARGE") ??
					process.env.BRIDGENODE_MODEL_LARGE ??
					MODEL_LARGE_DEFAULT,
			};
		})();
		bundleCache.set(cacheKey, cached);
	}
	return cached;
}

function toTextStreamResult(
	result: Awaited<ReturnType<typeof streamText>>,
): TextStreamResult {
	return {
		textStream: result.textStream,
		text: Promise.resolve(result.text),
		usage: Promise.resolve(
			result.usage,
		) as unknown as TextStreamResult["usage"],
		finishReason: Promise.resolve(
			result.finishReason,
		) as TextStreamResult["finishReason"],
	};
}

/**
 * Build a text-generation handler for a specific model tier.
 *
 * The manifest binds TEXT_SMALL → createTextHandler("small") and
 * TEXT_LARGE → createTextHandler("large"); both share the same x402 + AI SDK
 * wiring (402 → sign → retry happens transparently inside the fetch wrapper).
 */
export function createTextHandler(tier: "small" | "large") {
	return async (
		runtime: IAgentRuntime,
		params: GenerateTextParams,
	): Promise<PluginModelResult<"TEXT_SMALL">> => {
		const bundle = await getProviderBundle(runtime);
		const provider = createOpenAICompatible({
			name: "bridgenode",
			baseURL: bundle.config.baseUrl,
			fetch: bundle.fetch,
		});
		const model = provider.chatModel(
			tier === "large" ? bundle.modelLarge : bundle.modelSmall,
		);

		if (params.stream) {
			const result = await streamText({
				model,
				prompt: params.prompt,
				maxOutputTokens: params.maxTokens,
				temperature: params.temperature,
			});
			return toTextStreamResult(result);
		}

		const result = await generateText({
			model,
			prompt: params.prompt,
			maxOutputTokens: params.maxTokens,
			temperature: params.temperature,
		});
		return result.text;
	};
}
