# @bridgenode/plugin-x402

**ElizaOS plugin for pay-per-request LLM inference via [x402](https://docs.x402.org) on Solana USDC.**

No API keys. No accounts. No subscriptions. Agents pay per request with USDC
micropayments — gas fees sponsored by BridgeNode.

[![npm version](https://img.shields.io/npm/v/@bridgenode/plugin-x402)](https://www.npmjs.com/package/@bridgenode/plugin-x402)
[![License: MIT-0](https://img.shields.io/badge/license-MIT--0-blue)](LICENSE)
[![CI](https://github.com/bridgenode-ai/elizaos-plugin-x402/actions/workflows/ci.yml/badge.svg)](https://github.com/bridgenode-ai/elizaos-plugin-x402/actions/workflows/ci.yml)

## Features

- **Pay-per-request LLM inference** — OpenAI-compatible endpoint through
  [BridgeNode](https://bridgenode.cc/v1)
- **x402 payment flow** — 402 → sign → retry, fully automatic (no custom crypto)
- **Streaming, tools & structured output** — via AI SDK, for free
- **Live pricing** — model costs from `/v1/models`, never hardcoded
- **Configurable spend cap** — `BRIDGENODE_MAX_USDC_PER_TX` (default $1)
- **Free models** available (zero-cost)
- **Gas sponsored** — agents only need a USDC ATA, no SOL for fees

## Why BridgeNode?

| | BridgeNode plugin | Other x402 plugins |
|---|---|---|
| Working payment flow | ✅ | ❌ (broken signer) |
| Streaming / tools / structured output | ✅ | ❌ |
| Live pricing from `/v1/models` | ✅ | ❌ (hardcoded) |
| Spend cap | ✅ | ❌ |

## Installation

```bash
npm install @bridgenode/plugin-x402
```

## Usage

Add the plugin to your character:

```json
{
  "name": "my-agent",
  "plugins": ["@bridgenode/plugin-x402"],
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "your-agent-wallet-base58-private-key"
    }
  }
}
```

Or set the environment variables (see `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `SOLANA_PRIVATE_KEY` | ✅ | — | Agent wallet private key (base58) |
| `SOLANA_RPC_URL` | ❌ | mainnet-beta | Solana RPC endpoint |
| `BRIDGENODE_BASE_URL` | ❌ | `https://bridgenode.cc/v1` | BridgeNode endpoint (origin-pinned, see below) |
| `BRIDGENODE_PAY_TO` | ❌ | BridgeNode USDC wallet | Payment recipient — only this address is ever paid |
| `BRIDGENODE_MAX_USDC_PER_TX` | ❌ | `1` | Max USDC per transaction (safety cap) |
| `BRIDGENODE_MODEL_SMALL` | ❌ | `deepseek-v4-flash` | Model for `TEXT_SMALL` |
| `BRIDGENODE_MODEL_LARGE` | ❌ | `glm-5.2` | Model for `TEXT_LARGE` |

> The wallet must have a **USDC ATA** on Solana mainnet (the first USDC transfer
> auto-creates it). No SOL balance is required — BridgeNode sponsors gas fees.

## Spend cap

`BRIDGENODE_MAX_USDC_PER_TX` limits how much a single inference request can cost
(default `1` USD). Set it to the canonical value `0` to fully disable the cap
(not recommended). The cap is enforced client-side before signing any payment
transaction. If a request would exceed the cap, the payment is aborted and an
error is logged.

Validation is **fail-closed**: a blank, non-numeric (`one`), `NaN`/`Infinity`,
or negative value is rejected with an error at config load — a configuration
typo can never silently disable the payment limit. Only an explicit `0`
disables it.

## Payment safety pins (fail-closed)

Beyond the spend cap, the plugin refuses to sign anything that is not exactly
what BridgeNode advertises:

- **Asset pin (USDC only)** — a `PaymentPolicy` validates every payment
  requirement before signing: only Solana-mainnet USDC
  (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) is accepted. The other
  `@x402/svm` mainnet default assets (USDT, USDG, PYUSD, CASH) are rejected
  with an error — nothing is signed.
- **Recipient pin** — payments are only ever made to `BRIDGENODE_PAY_TO`
  (default: the BridgeNode USDC wallet). A challenge offering any other
  recipient is rejected.
- **Origin pin** — `BRIDGENODE_BASE_URL` must be HTTPS on exactly
  `bridgenode.cc` (subdomains and other hosts are rejected). Validation runs
  at config load, before any fetch is created.

All three pins throw at the point of violation, so a malicious or
misconfigured endpoint can never cause an unintended payment.

## Models

Live model list & pricing: <https://bridgenode.cc/v1/models>

`TEXT_SMALL` maps to `BRIDGENODE_MODEL_SMALL` (default `deepseek-v4-flash`),
`TEXT_LARGE` maps to `BRIDGENODE_MODEL_LARGE` (default `glm-5.2`). Override via
env or character settings.

## Actions

- **`GET_PRICE_ESTIMATE`** — fetches live pricing from `/v1/models` and reports
  it to the agent (free vs paid models, $/M tokens).

## Development

```bash
npm install
npm run typecheck
npm run build
npm test          # unit tests (live-payment tests self-skip without TEST_WALLET_PK)
```

To run the live integration tests (real payment, few cents, S3-approved):

```bash
TEST_WALLET_PK=your-base58-key npx vitest run __tests__/live.integration.test.ts __tests__/smoke.test.ts
```

## License

MIT-0 (No Attribution) — see [LICENSE](./LICENSE). BridgeNode is an
agent-to-agent (A2A) platform; this plugin is built for autonomous agents.
