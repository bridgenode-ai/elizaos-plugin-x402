import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPriceEstimate } from "../src/actions/getPriceEstimate.js";

const modelsPayload = {
	object: "list",
	data: [
		{
			id: "gpt-oss-20b",
			pricing: { prompt: 0, completion: 0 },
			context_window: 131072,
		},
		{
			id: "deepseek-v4-flash",
			pricing: { prompt: 2.574e-7, completion: 7.722e-7 },
			context_window: 1048576,
		},
	],
};

let lastCallbackText = "";

beforeEach(() => {
	lastCallbackText = "";
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			new Response(JSON.stringify(modelsPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const runtime = {
	getSetting: () => undefined,
} as never;

describe("getPriceEstimate", () => {
	it("reports live pricing with FREE for zero-cost models", async () => {
		await getPriceEstimate.handler(
			runtime,
			{} as never,
			undefined,
			undefined,
			async (content) => {
				lastCallbackText = content.text ?? "";
			},
		);
		expect(lastCallbackText).toContain("BridgeNode live pricing");
		expect(lastCallbackText).toContain("gpt-oss-20b");
		expect(lastCallbackText).toContain("FREE");
		expect(lastCallbackText).toContain("deepseek-v4-flash");
		expect(lastCallbackText).toContain("/M completion");
	});

	it("calls the configured base URL (env override)", async () => {
		process.env.BRIDGENODE_BASE_URL = "https://custom.cc/v1/";
		await getPriceEstimate.handler(
			runtime,
			{} as never,
			undefined,
			undefined,
			async (content) => {
				lastCallbackText = content.text ?? "";
			},
		);
		const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
		const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(calledUrl).toBe("https://custom.cc/v1/models");
		delete process.env.BRIDGENODE_BASE_URL;
	});

	it("reports failure gracefully on HTTP error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 503 })),
		);
		await getPriceEstimate.handler(
			runtime,
			{} as never,
			undefined,
			undefined,
			async (content) => {
				lastCallbackText = content.text ?? "";
			},
		);
		expect(lastCallbackText).toContain("Price estimate failed");
		expect(lastCallbackText).toContain("503");
	});
});
