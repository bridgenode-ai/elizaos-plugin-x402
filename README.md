# @bridgenode/plugin-x402

**ElizaOS plugin for pay-per-request LLM inference via x402 on Solana USDC.**

No API keys. No accounts. No subscriptions. Agents pay per request with USDC
micropayments over [x402](https://docs.x402.org) — gas fees sponsored by
BridgeNode.

## Features

- OpenAI-compatible inference through BridgeNode (`https://bridgenode.cc/v1`)
- x402 payment flow: 402 → sign → retry, fully automatic
- Streaming, tools & structured output via AI SDK
- Live pricing from `/v1/models` (no hardcoded rates)
- Configurable per-transaction spend cap
- Free models available

## Installation

```bash
npm install @bridgenode/plugin-x402
```

## Usage

Add the plugin to your character:

```json
{
  "name": "my-agent",
  "plugins": ["@bridgenode/plugin-x402"]
}
```

Set the environment variables (see `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `SOLANA_PRIVATE_KEY` | ✅ | — | Agent wallet private key (base58) |
| `SOLANA_RPC_URL` | ❌ | mainnet-beta | Solana RPC endpoint |
| `BRIDGENODE_BASE_URL` | ❌ | `https://bridgenode.cc/v1` | BridgeNode endpoint |
| `BRIDGENODE_MAX_USDC_PER_TX` | ❌ | `1` | Max USDC per transaction (safety cap) |
| `BRIDGENODE_MODEL_SMALL` | ❌ | `deepseek-v4-flash` | Model for `TEXT_SMALL` |
| `BRIDGENODE_MODEL_LARGE` | ❌ | `glm-5.2` | Model for `TEXT_LARGE` |

> The wallet must have a USDC ATA (first USDC transfer auto-creates it) and a
> small SOL balance is not required — BridgeNode sponsors gas fees.

## Spend cap

`BRIDGENODE_MAX_USDC_PER_TX` limits how much a single inference request can
cost (default `1` USD). Set it to `0` to fully disable the cap (not
recommended). The cap is enforced client-side before signing any payment
transaction. If a request would exceed the cap, the payment is aborted and an
error is logged.

## Models

Live model list & pricing: <https://bridgenode.cc/v1/models>

## License

MIT-0 (No Attribution) — see [LICENSE](./LICENSE).
