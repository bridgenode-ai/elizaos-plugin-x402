import { describe, expect, it, vi } from "vitest";

// Mock the x402 module: createX402Fetch returns a plain fetch stub so the
// provider wiring is tested in isolation (the 402→sign→retry flow itself is
// covered by sdk-ts tests + live checks in Phase 0.6/2.8).
vi.mock("../src/x402.js", () => ({
	// Delegate to the CURRENT mockFetch on every call — provider.ts caches the
	// bundle per wallet, so a stable wrapper (not a snapshot) is required.
	createX402Fetch: vi.fn(async () => (input: RequestInfo | URL, init?: RequestInit) =>
		mockFetch(input, init),
	),
	getX402Config: vi.fn(() => ({
		privateKey: "test",
		rpcUrl: "https://rpc",
		baseUrl: "https://bridgenode.cc/v1",
		maxUsdcPerTx: 1,
	})),
}));

import { createTextHandler } from "../src/provider.js";

// ── mock fetch: OpenAI-compatible responses ─────────────────────────────

const nonStreamResponse = {
	id: "chatcmpl-test",
	object: "chat.completion",
	created: 1787500000,
	model: "deepseek-v4-flash",
	choices: [
		{
			index: 0,
			message: { role: "assistant", content: "Hello from mock" },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

const streamChunks = [
	'data: {"id":"c","object":"chat.completion.chunk","created":1787500000,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}\n\n',
	'data: {"id":"c","object":"chat.completion.chunk","created":1787500000,"model":"m","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
	'data: {"id":"c","object":"chat.completion.chunk","created":1787500000,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
	"data: [DONE]\n\n",
];

let mockFetch: typeof fetch;

function makeFetch(opts: { stream: boolean }) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		if (opts.stream) {
			return new Response(new Blob(streamChunks), {
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"PAYMENT-RESPONSE": Buffer.from(
						JSON.stringify({ success: true }),
					).toString("base64"),
				},
			});
		}
		return new Response(JSON.stringify(nonStreamResponse), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
}

const runtime = {
	getSetting: () => undefined,
} as never;

describe("createTextHandler", () => {
	it("non-stream: returns text from the model", async () => {
		mockFetch = makeFetch({ stream: false });
		const handler = createTextHandler("small");
		const result = await handler(runtime, {
			prompt: "hi",
			maxTokens: 32,
		});
		expect(result).toBe("Hello from mock");
	});

	it("stream: returns a TextStreamResult that yields chunks", async () => {
		mockFetch = makeFetch({ stream: true });
		const handler = createTextHandler("large");
		const result = (await handler(runtime, {
			prompt: "hi",
			stream: true,
		})) as Awaited<ReturnType<typeof handler>> & {
			textStream: AsyncIterable<string>;
			text: Promise<string>;
		};

		let full = "";
		for await (const chunk of result.textStream) {
			full += chunk;
		}
		expect(full).toBe("Hello");
		const text = await result.text;
		expect(text).toBe("Hello");
	});

	it("error: rethrows provider errors", async () => {
		mockFetch = vi.fn(async () => {
			throw new Error("upstream exploded");
		});
		const handler = createTextHandler("small");
		await expect(handler(runtime, { prompt: "hi" })).rejects.toThrow(
			/upstream exploded/,
		);
	});
});
