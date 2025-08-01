# LLMLayer JavaScript SDK

[![npm](https://img.shields.io/npm/v/llmlayer?color=blue)](https://www.npmjs.com/package/llmlayer)
[![license](https://img.shields.io/npm/l/llmlayer.svg)](LICENSE)

> **Search – Reason – Cite** with one function call
> The *official* JavaScript / TypeScript client for the **[LLMLayer Search & Answer API](https://llmlayer.ai)**.

---

## ✨ Features

|                             |                                                        |
| --------------------------- | ------------------------------------------------------ |
| 🗂 **Multi‑provider**       | OpenAI, Groq, DeepSeek       |
| 🔄 **Blocking & Streaming** | Promise‑based blocking call **or** async‑iterator stream |
| ⏱ **SSE chunks**            | Low‑latency output perfect for chat UIs & CLIs         |
| 🛡 **Typed errors**         | `InvalidRequest`, `ProviderError`, `RateLimitError`, … |

---

## Installation

```bash
npm i llmlayer            # or  yarn add llmlayer  /  pnpm add llmlayer
```

*Requires Node **≥ 16** (works in browsers & Workers too).*
*(On Node ≤ 18 the SDK auto‑loads `undici` to provide `fetch`.)*

---

## Quick Start

```ts
import { LLMLayerClient } from 'llmlayer';

const client = new LLMLayerClient({
  apiKey:      process.env.LLMLAYER_API_KEY,   // LLMLayer bearer
});

/* 1️⃣ Blocking call */
const resp = await client.search({
  query: 'Why is the sky blue?',
  model: 'openai/gpt‑4.1‑mini',
  returnSources: true
});
console.log(resp.llm_response);

/* 2️⃣ Streaming */
for await (const ev of client.searchStream({
  query: 'Explain brown dwarfs in two sentences',
  model: 'groq/kimi-k2',
  returnSources: true
})) {
  if (ev.type === 'llm')        process.stdout.write(ev.content);
  else if (ev.type === 'sources') console.log('\nSources:', ev.data);
  else if (ev.type === 'done')    console.log(`\n✓ finished in ${ev.response_time}s`);
}
```

> **Tip — use env vars in production** to keep keys out of source control.

---

## Blocking vs Streaming

| Method           | Returns                             | When to use                         |
| ---------------- | ----------------------------------- | ----------------------------------- |
| `search()`       | `Promise<SimplifiedSearchResponse>` | Quick one‑shot requests             |
| `searchStream()` | `AsyncGenerator<Event>`             | Real‑time progress for long answers |

---

## API Reference

### `new LLMLayerClient(options)`

| option        | type          | default                    | description                        |
| ------------- | ------------- | -------------------------- | ---------------------------------- |
| `apiKey`      | `string`      | —                          | **Required** LLMLayer bearer token |
| `baseURL`     | `string`      | `https://api.llmlayer.dev` | Override for self‑host/staging     |
| `timeoutMs`   | `number`      | `60000`                    | Abort after N ms                   |

#### Methods

| method                 | description                                |
| ---------------------- | ------------------------------------------ |
| `search(params)`       | Blocking call → `SimplifiedSearchResponse` |
| `searchStream(params)` | Async iterator yielding SSE events         |

Type defs live in [`src/models.ts`](./src/models.ts).

---

## Key Request Parameters

| name                | type                 | default      | notes                                               |
|---------------------|----------------------|--------------|-----------------------------------------------------|
| `query`             | `string`             | —            | Your question                                       |
| `model`             | `string`             | —            | Provider model name                                 |
| `returnSources`     | `boolean`            | `false`      | Attach sources list                                 |
| `returnImages`      | `boolean`            | `false`      | Include image results                               |
| `answerType`        | `'markdown'\|…`      | `'markdown'` | `json` returns structured output                    |
| `searchType`        | `'general'\| 'news'` | `'general'`  | Vertical bias                                       |
| `responseLanguage`  | `string`             | `'auto'`     | e.g. `'en'`, `'fr'`, or `'auto'` detection          |
| `location`          | `string`             | `'us'`       | Geo bias for web search (ISO‑2 country code)        |
| `dateFilter`        | `'hour'…'anytime'`   | `'anytime'`  | Recency filter                                      |
| `domainFilter`      | `string[]`           | —            | `['nytimes.com', '-wikipedia.org']`                 |
| `maxQueries`        | `number`             | `1`          | How many search queries LLMLayer should generate    |
| `maxTokens`         | `number`             | `1500`       | LLM response length                                 |
| `temperature`       | `number`             | `0.7`        | Creativity knob                                     |
| `searchContextSize` | `string`             | `medium`     | values : `low`  `medium`  `high` |


See the **Parameters** page in the docs site for the full table.
\*\* page in the docs site for the full table.

---

## Environment Variables

```bash
# LLMLayer bearer (required)
export LLMLAYER_API_KEY="llm_xxxxxxxxxxxxx"
```

Then simply:

```ts
const client = new LLMLayerClient({ }); // all keys auto‑picked from env
```

---

## Need Help?

* 💬 [Join our Discord](https://discord.gg/EqQF4cjTq5)
* 🐛 [Open an issue](https://github.com/YassKhazzan/llmlayer_js/issues)

---

MIT © 2025 LLMLayer Inc.
