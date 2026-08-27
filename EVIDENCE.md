# EVIDENCE — Live payment E2E

> **Package:** `@bridgenode/plugin-x402@0.1.6` (published npm tarball — the exact
> artifact the registry entry points to; `npm pack @bridgenode/plugin-x402@0.1.6`)
> **Endpoint:** `https://bridgenode.cc/v1/chat/completions`
> **Network:** Solana mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
> **Date:** 2026-08-27 (UTC)

This document is the live-spend evidence for the ElizaOS registry listing
([#26541](https://github.com/elizaOS/eliza/pull/26541) / integration issue
[#29009](https://github.com/elizaOS/eliza/issues/29009)): a real, reproducible,
on-chain-verified USDC payment made by the **published** plugin against the live
BridgeNode API — plus replay protection checks.

No private keys are printed here. All addresses and transaction hashes are
public chain data.

---

## 1. Setup

| Item | Value |
|---|---|
| Package | `@bridgenode/plugin-x402@0.1.6` (npm, published) |
| Payer (agent wallet) | `GMmhftyi5L1BKJdGjxPi3Z8khCB7a18FtyRFodXhkkav` |
| Payer USDC ATA | `7qbDrBx2pVg1wx4mDxULaW274iFX2BTjPSdDKEVEmpZq` |
| Recipient (BridgeNode) | `BHMDv3ri3LBEZjEzJgDZeUiguVX7LmsCstTXbM3dL8rN` |
| Recipient USDC ATA | `2VgXdacjxnra4B6c7vbyH3MKGHZ4tqZxU1Gsj8fCM57P` |
| Fee payer (gas sponsor) | `BHMDv3ri3LBEZjEzJgDZeUiguVX7LmsCstTXbM3dL8rN` (= recipient) |
| Spend cap | `BRIDGENODE_MAX_USDC_PER_TX=1` (default; cap ON) |
| Model / request | `deepseek-v4-flash`, `"Reply with exactly: OK"`, `max_tokens: 16` |

The payer wallet holds only **USDC + a small SOL dust amount** — exactly the
agent profile the plugin is designed for. Gas fees are sponsored by BridgeNode
(fee payer = BridgeNode wallet), so the agent never needs SOL for fees.

---

## 2. Flow observed (HTTP level)

1. `POST /v1/chat/completions` (no payment header) → **HTTP 402** with
   `PAYMENT-REQUIRED` envelope (decoded):
   ```json
   {
     "scheme": "exact",
     "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
     "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
     "amount": "2000",
     "payTo": "BHMDv3ri3LBEZjEzJgDZeUiguVX7LmsCstTXbM3dL8rN",
     "maxTimeoutSeconds": 30,
     "extra": {
       "memo": "pi_0644bb60bdc74e7497ed7b61bf69ba68",
       "feePayer": "BHMDv3ri3LBEZjEzJgDZeUiguVX7LmsCstTXbM3dL8rN"
     }
   }
   ```
2. Plugin signs the partial TX (USDC `TransferChecked` + memo, **no fee-payer
   signature**) and retries with `PAYMENT-SIGNATURE`.
3. BridgeNode settles (adds fee-payer signature, submits, confirms) →
   **HTTP 200** + `PAYMENT-RESPONSE` header:
   ```json
   {
     "success": true,
     "payer": "GMmhftyi5L1BKJdGjxPi3Z8khCB7a18FtyRFodXhkkav",
     "transaction": "5rfERdqEUuE3UMx3HY7qGqCSek6bkrrWfWbgvCynMeVV8NR89J4yTi5eKhnfY93GXRqGRxJkxBawDizbeKuWDXxk",
     "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
     "amount": "2000"
   }
   ```
4. Response body: `{"content":"OK", ...}` — a normal OpenAI-compatible
   `chat.completion`.

## 3. On-chain verification (Helius `getTransaction`)

Two independent runs (both settled, both verified):

| TX signature | Slot | Fee (lamports) | Result |
|---|---|---|---|
| `3mm38JTHsXyfNXiE2483PViLGwMLanK3L3yxErDMY3ax6nsZhmQ5EDcVDPutuGHzyywRg6Zjb2cRKnyuBanAek23` | 442134855 | 10001 | success |
| `5rfERdqEUuE3UMx3HY7qGqCSek6bkrrWfWbgvCynMeVV8NR89J4yTi5eKhnfY93GXRqGRxJkxBawDizbeKuWDXxk` | 442134917 | 10001 | success |

Both contain exactly one USDC `transferChecked` instruction:

```
source:      7qbDrBx2pVg1wx4mDxULaW274iFX2BTjPSdDKEVEmpZq  (payer ATA)
destination: 2VgXdacjxnra4B6c7vbyH3MKGHZ4tqZxU1Gsj8fCM57P  (BridgeNode ATA)
amount:      0.002 USDC  (mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
```

Signers: `[BridgeNode wallet (fee payer), payer, ATA accounts]` — the fee payer
sponsorship is visible on-chain: **the agent paid 0 SOL in fees** (only USDC).

## 4. Replay protection (no double charge)

After a successful settle, the **same** `PAYMENT-SIGNATURE` was replayed from a
second process:

- Same signature + same body → HTTP 200, but with the **same**
  `PAYMENT-RESPONSE` (same TX hash) — the saved response is returned; **no new
  transaction is created**.
- On-chain: exactly **one** USDC transfer exists for that payment (verified via
  `getTransaction`); the replay did not produce a second transfer.

Result: a captured authorization cannot be spent twice and cannot be re-used to
get a free re-run.

## 5. Reproduce

Requirements: Node ≥20, a Solana mainnet wallet with a USDC ATA (any amount ≥ a
few cents; no SOL needed for the payment itself), and the plugin installed:

```bash
npm install @bridgenode/plugin-x402@0.1.6
```

```js
// e2e.mjs — run with: SOLANA_PRIVATE_KEY=<base58> node e2e.mjs
import { createX402Fetch, getX402Config } from "@bridgenode/plugin-x402"; // (deep import dist/x402.js for the fetch helper)

process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
process.env.BRIDGENODE_BASE_URL = "https://bridgenode.cc/v1";
process.env.BRIDGENODE_MAX_USDC_PER_TX = "1";

const config = getX402Config();
const x402Fetch = await createX402Fetch(config);

const res = await x402Fetch("https://bridgenode.cc/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    max_tokens: 16,
  }),
});

console.log("HTTP", res.status);
console.log("PAYMENT-RESPONSE:", res.headers.get("payment-response"));
console.log(await res.text());
```

The `PAYMENT-RESPONSE` header contains the settlement receipt
(`transaction`, `payer`, `amount`, `network`) — verify it on any Solana
explorer. Replay the returned `PAYMENT-SIGNATURE` from a second process and
confirm no second transaction appears on-chain.

---

*All transactions above are real mainnet settlements. Money moved from the
BridgeNode-controlled test wallet to the BridgeNode recipient wallet (same
operator) — total spent: $0.004 USDC.*
