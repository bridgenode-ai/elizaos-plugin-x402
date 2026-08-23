import type {
	GenerateTextParams,
	IAgentRuntime,
	PluginModelResult,
} from "@elizaos/core";

/**
 * Text generation handler for TEXT_SMALL / TEXT_LARGE (Phase 2.2).
 *
 * Stub: full implementation lands in Phase 2.5 (AI SDK provider wired to the
 * x402 fetch wrapper from src/x402.ts). Kept here so the manifest (2.2) is
 * buildable and the model types are registered from day one.
 */
export async function handleTextGeneration(
	_runtime: IAgentRuntime,
	_params: GenerateTextParams,
): Promise<PluginModelResult<"TEXT_SMALL">> {
	throw new Error(
		"@bridgenode/plugin-x402: model handler not implemented yet (Phase 2.5)",
	);
}
