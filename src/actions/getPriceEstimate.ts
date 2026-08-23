import type {
	Action,
	Content,
	IAgentRuntime,
	Memory,
	State,
} from "@elizaos/core";

/**
 * Live pricing from https://bridgenode.cc/v1/models — no hardcoded rates
 * (DINAMIŠKUMO PRINCIPAS). Models with prompt+completion == 0 are free.
 */
export const getPriceEstimate: Action = {
	name: "GET_PRICE_ESTIMATE",
	similes: ["PRICE_CHECK", "MODEL_PRICES", "LLM_COST"],
	description:
		"Fetch current BridgeNode model pricing from /v1/models. Use when the agent needs live LLM inference costs, cheapest available model, or to compare models.",
	validate: async (_runtime: IAgentRuntime) => true,
	handler: async (
		runtime: IAgentRuntime,
		_message: Memory,
		_state: State | undefined,
		_options: unknown,
		callback?: (response: Content) => Promise<unknown>,
	) => {
		try {
		const baseSetting = runtime.getSetting("BRIDGENODE_BASE_URL");
			const baseUrl = (
				typeof baseSetting === "string"
					? baseSetting
					: process.env.BRIDGENODE_BASE_URL ?? "https://bridgenode.cc/v1"
			).replace(/\/+$/, "");
			const res = await fetch(`${baseUrl}/models`, {
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				throw new Error(`/v1/models → ${res.status}`);
			}
			const data = (await res.json()) as {
				data?: Array<{
					id: string;
					pricing?: { prompt?: number; completion?: number };
					context_window?: number;
				}>;
			};
			const models = data.data ?? [];
			if (models.length === 0) {
				throw new Error("/v1/models empty");
			}

			const lines = models.map((m) => {
				const p = m.pricing ?? {};
				const free =
					(p.prompt ?? 0) === 0 && (p.completion ?? 0) === 0;
				const promptUsd = ((p.prompt ?? 0) * 1e6).toFixed(4);
				const completionUsd = ((p.completion ?? 0) * 1e6).toFixed(4);
				const ctx = m.context_window
					? `${Math.round(m.context_window / 1024)}k`
					: "?";
				return free
					? `- ${m.id} (${ctx} ctx): FREE`
					: `- ${m.id} (${ctx} ctx): $${promptUsd}/M prompt, $${completionUsd}/M completion`;
			});

			const text = `BridgeNode live pricing (${baseUrl}/models):\n${lines.join("\n")}`;
			await callback?.({ text });
		} catch (err) {
			const text = `Price estimate failed: ${
				err instanceof Error ? err.message : String(err)
			}`;
			await callback?.({ text });
		}
	},
};
