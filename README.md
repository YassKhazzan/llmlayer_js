# LLMLayer JavaScript / TypeScript SDK (API v2)

> **Search → Reason → Cite** with one call.
>
> Official JS/TS client for the **LLMLayer Web API v2** — typed, streaming‑friendly, and production‑ready.

---

## Table of Contents

* [Overview](#overview)
* [What’s new in v2 (breaking changes)](#whats-new-in-v2-breaking-changes)
* [Installation](#installation)
* [Authentication](#authentication)
* [Quickstart](#quickstart)
* [Answer API](#answer-api)

  * [When to use blocking vs streaming](#when-to-use-blocking-vs-streaming)
  * [Blocking Answer — `POST /api/v2/answer`](#blocking-answer--post-apiv2answer)
  * [Streaming Answer — `POST /api/v2/answer_stream`](#streaming-answer--post-apiv2answer_stream)
  * [Request Parameters (complete reference)](#request-parameters-complete-reference)
  * [Response Shape](#response-shape)
  * [Streaming Frames](#streaming-frames)
* [Utilities](#utilities)

  * [Web Search — `POST /api/v2/web_search`](#web-search--post-apiv2web_search)
  * [Scrape (multi-format) — `POST /api/v2/scrape`](#scrape-multi-format--post-apiv2scrape)
  * [PDF Content — `POST /api/v2/get_pdf_content`](#pdf-content--post-apiv2get_pdf_content)
  * [YouTube Transcript — `POST /api/v2/youtube_transcript`](#youtube-transcript--post-apiv2youtube_transcript)
  * [Map — `POST /api/v2/map`](#map--post-apiv2map)
  * [Crawl Stream — `POST /api/v2/crawl_stream`](#crawl-stream--post-apiv2crawl_stream)
* [End‑to‑End Pipelines](#end-to-end-pipelines)

  * [Map → Crawl → Save Knowledge Base](#map--crawl--save-knowledge-base)
  * [Batch Screenshot a Section](#batch-screenshot-a-section)
* [Types & Imports](#types--imports)
* [Errors](#errors)
* [Best Practices](#best-practices)
* [Troubleshooting](#troubleshooting)
* [Builds & Runtime](#builds--runtime)
* [License & Support](#license--support)

---

## Overview

**LLMLayer** unifies web search, context building, and LLM reasoning behind a clean API. The SDK ships:

* **Answer** (blocking & streaming via SSE)
* **Vertical Web Search** (general/news/images/videos/shopping/scholar)
* **Scraping** (markdown/html/pdf/screenshot)
* **PDF** text extraction
* **YouTube** transcript + metadata
* **Site Map** discovery
* **Crawl Stream** (stream pages & artifacts; usage billed per successful page)

All endpoints are typed, error‑mapped, and work in Node **18+** and modern browsers.

---

## What’s new in v2 (breaking changes)

* **All routes → `/api/v2`**.
* **Answer response** now uses `answer` (was `llm_response`).
* **Answer streaming** emits `{ type: 'answer', content: '...' }` (was `type: 'llm'`).
* **Scrape** accepts **`formats: ('markdown'|'html'|'screenshot'|'pdf')[]`** and returns `markdown/html/pdf/screenshot`, `title`, `metadata`, and **`statusCode`**.
* **Map** response uses **`statusCode`**.
* **Crawl** request takes a single **`url`** and a **`formats`** list; stream frames are `page`/`usage`/`done`/`error`.
* **YouTube** adds metadata: `title`, `description`, `author`, `views`, `likes`, `date`.

---

## Installation

```bash
# npm
npm i llmlayer
# yarn
yarn add llmlayer
# pnpm
pnpm add llmlayer
```

> **Node ≥ 18.17** recommended. The SDK uses global `fetch`; on Node it falls back to `undici` automatically.

---

## Authentication

All requests require a bearer token:

```http
Authorization: Bearer YOUR_LLMLAYER_API_KEY
```

Missing/invalid keys return **401** with `error_code: "missing_llmlayer_api_key"`.

> **Never expose your API key in public frontend code.** Call LLMLayer from your server (or a proxy) and stream results to the browser.

---

## Quickstart

```ts
import { LLMLayerClient } from 'llmlayer';

async function main() {
  const client = new LLMLayerClient({
    apiKey: process.env.LLMLAYER_API_KEY!,
    // baseURL: 'https://api.llmlayer.dev', // optional
  });

  // Blocking answer
  const resp = await client.answer({
    query: 'What are the latest AI breakthroughs?',
    model: 'openai/gpt-4o-mini',
    return_sources: true,
  });
  console.log(resp.answer);

  // Streaming answer
  let text = '';
  for await (const ev of client.streamAnswer({
    query: 'Explain edge AI in one short paragraph',
    model: 'openai/gpt-4o-mini',
  })) {
    if (ev.type === 'answer') text += ev.content;
    if (ev.type === 'done') console.log('done in', ev.response_time, 's');
  }
  console.log('final text:', text);
}

main().catch(console.error);
```

---

## Answer API

### When to use blocking vs streaming

* **Blocking** (`POST /api/v2/answer`): you need the complete answer before proceeding or you want **structured JSON** (with `json_schema`).
* **Streaming** (`POST /api/v2/answer_stream`): chat UIs, progressive rendering, lower perceived latency.

> **Note:** Streaming **does not** support `answer_type: 'json'`. Use blocking for structured output.

### Blocking Answer — `POST /api/v2/answer`

The server runs targeted search → builds a context → calls your chosen model → returns the final answer with optional sources/images and usage.

```ts
const resp = await client.answer({
  query: 'Explain quantum computing in simple terms',
  model: 'openai/gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 1000,
  return_sources: true,
});

console.log(resp.answer);
console.log('sources:', resp.sources.length);
console.log('total cost =', (resp.model_cost ?? 0) + (resp.llmlayer_cost ?? 0));
```

**Structured JSON output**

```ts
const schema = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
  },
  required: ['topic', 'bullets'],
};

const resp = await client.answer({
  query: 'Return a topic and 3 bullets about transformers',
  model: 'openai/gpt-4o',
  answer_type: 'json',
  json_schema: schema, // object allowed; SDK serializes
});

const data = typeof resp.answer === 'string' ? JSON.parse(resp.answer) : resp.answer;
console.log(data.topic, data.bullets.length);
```

### Streaming Answer — `POST /api/v2/answer_stream`

```ts
for await (const event of client.streamAnswer({
  query: 'History of the Internet in 5 lines',
  model: 'groq/llama-3.3-70b-versatile',
  return_sources: true,
})) {
  switch (event.type) {
    case 'answer':  process.stdout.write(event.content); break;  // v2: 'answer'
    case 'sources': console.log('\n[SOURCES]', event.data.length); break;
    case 'images':  console.log('\n[IMAGES]', event.data.length); break;
    case 'usage':   console.log('\n[USAGE]', event); break;
    case 'done':    console.log('\n✓ finished in', event.response_time, 's'); break;
    case 'error':   console.error('stream error:', event.error); break;
  }
}
```

---

### Request Parameters (complete reference)

You may use **camelCase** or **snake_case** — the SDK converts to the backend’s format.

| Param                 | Type                                                          | Required | Default      | Description                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------- | :------: | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`               | `string`                                                      |     ✅    | —            | Your question or instruction.                                                                                                                                                                 |
| `model`               | `string`                                                      |     ✅    | —            | LLM id (e.g., `openai/gpt-4o-mini`, `openai/gpt-4.1-mini`, `anthropic/claude-sonnet-4`, `groq/llama-3.3-70b-versatile`, `deepseek/deepseek-reasoner`). Unsupported → **400** `invalid_model`. |
| `provider_key`        | `string`                                                      |          | —            | Your upstream provider key. If set, **provider usage is billed to you**, and `model_cost` becomes `null`.                                                                                     |
| `location`            | `string`                                                      |          | `"us"`       | Market/geo bias for search (country code).                                                                                                                                                    |
| `system_prompt`       | `string \| null`                                              |          | `null`       | Override the default system prompt (non‑JSON answers).                                                                                                                                        |
| `response_language`   | `string`                                                      |          | `"auto"`     | Output language; `auto` infers from the query.                                                                                                                                                |
| `answer_type`         | `'markdown' \| 'html' \| 'json'`                              |          | `"markdown"` | Output format. If `'json'`, you **must** provide `json_schema`. Not supported by streaming.                                                                                                   |
| `search_type`         | `'general' \| 'news'`                                         |          | `"general"`  | Search vertical. (Use `searchWeb` for other verticals.)                                                                                                                                       |
| `json_schema`         | `string`                                                      |          | —            | **Required when `answer_type='json'`.** You may pass an object; the SDK serializes it.                                                                                                        |
| `citations`           | `boolean`                                                     |          | `false`      | Embed inline markers like `[1]` in the answer body.                                                                                                                                           |
| `return_sources`      | `boolean`                                                     |          | `false`      | Include aggregated `sources` in the final response and emit a `sources` frame during streaming.                                                                                               |
| `return_images`       | `boolean`                                                     |          | `false`      | Include `images` results (adds a small LLMLayer fee).                                                                                                                                         |
| `date_filter`         | `'anytime' \| 'hour' \| 'day' \| 'week' \| 'month' \| 'year'` |          | `"anytime"`  | Recency filter.                                                                                                                                                                               |
| `max_tokens`          | `number`                                                      |          | `1500`       | Max LLM output tokens.                                                                                                                                                                        |
| `temperature`         | `number`                                                      |          | `0.7`        | Sampling temperature (0.0—2.0).                                                                                                                                                               |
| `domain_filter`       | `string[]`                                                    |          | —            | Include domains normally; **exclude** with `-domain.com`.                                                                                                                                     |
| `max_queries`         | `number`                                                      |          | `1`          | How many search sub‑queries to generate (1–5). Each adds **$0.004** and may improve coverage.                                                                                                 |
| `search_context_size` | `'low' \| 'medium' \| 'high'`                                 |          | `"medium"`   | How much context to feed the LLM.                                                                                                                                                             |

**Supported locations (examples)**

```txt
us, ca, uk, mx, es, de, fr, pt, be, nl, ch, no, se, at, dk, fi, tr, it, pl, ru, za, ae, sa, ar, br, au, cn, kr, jp, in, ps, kw, om, qa, il, ma, eg, ir, ly, ye, id, pk, bd, my, ph, th, vn
```

---

### Response Shape

`AnswerResponse`

```ts
{
  answer: string | object,
  response_time: number | string, // e.g. "1.23"
  input_tokens: number,
  output_tokens: number,
  sources: Array<Record<string, unknown>>,  // when return_sources=true
  images: Array<Record<string, unknown>>,   // when return_images=true
  model_cost?: number | null,               // null when using provider_key
  llmlayer_cost?: number | null
}
```

---

### Streaming Frames

The server emits JSON frames over SSE (`Content-Type: text/event-stream`) with a `type` discriminator:

| `type`    | Payload Keys                                                                                           | Meaning                     |
| --------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| `answer`  | `content: string`                                                                                      | Partial LLM text chunk (v2) |
| `sources` | `data: Array<object>`                                                                                  | Aggregated sources          |
| `images`  | `data: Array<object>`                                                                                  | Relevant images             |
| `usage`   | `input_tokens: number`, `output_tokens: number`, `model_cost: number \| null`, `llmlayer_cost: number` | Token/cost summary          |
| `done`    | `response_time: string`                                                                                | Completion                  |
| `error`   | `error: string`                                                                                        | Error frame (SDK raises)    |

> The SDK handles multi‑line `data:` frames and early error frames automatically.

---

## Utilities

### Web Search — `POST /api/v2/web_search`

```ts
const res = await client.searchWeb({
  query: 'ai agents',
  searchType: 'general',          // 'general' | 'news' | 'shopping' | 'videos' | 'images' | 'scholar'
  location: 'us',
  recency: 'day',
  domainFilter: ['-reddit.com', 'reuters.com'],
});
console.log(res.results.length, res.cost);
for (const r of res.results) {
  console.log(r.title, r.url,r.snippet);
}

const res2 = await client.searchWeb({
    query: 'latest ai news',
    searchType: 'news',
})

console.log(res2.results.length, res2.cost);
for (const r of res2.results) {
  console.log(r);
}




```

### Scrape (multi-format) — `POST /api/v2/scrape`

```ts
// pdf and screenshot are base64-encoded strings
// Request multiple outputs in one call
const r = await client.scrape({
  url: 'https://example.com',
  formats: ['markdown', 'html'], // 'markdown' | 'html' | 'screenshot' | 'pdf'
  includeImages: true,
  includeLinks: true,
});
console.log('status:', r.statusCode, 'cost:', r.cost);
console.log('md len:', (r.markdown || '').length, 'html?', !!r.html, 'pdf?', !!r.pdf, 'shot?', !!r.screenshot);
```

### PDF Content — `POST /api/v2/get_pdf_content`

```ts
const pdf = await client.getPdfContent('https://arxiv.org/pdf/1706.03762.pdf');
console.log('pages:', pdf.pages, 'status:', pdf.status_code, 'cost:', pdf.cost);
console.log('preview:', pdf.text.slice(0, 200));
```

### YouTube Transcript — `POST /api/v2/youtube_transcript`

```ts
const yt = await client.getYouTubeTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'en');
console.log(yt.title, yt.author, yt.views, yt.date, yt.description, yt.likes);
console.log(yt.transcript.slice(0, 200));
```

### Map — `POST /api/v2/map`

```ts
const map = await client.map({ url: 'https://docs.llmlayer.ai', limit: 100, includeSubdomains: false });
console.log('status:', map.statusCode, 'links:', map.links.length, 'cost:', map.cost);
console.log('first:', map.links[0]);
```

### Crawl Stream — `POST /api/v2/crawl_stream`

```ts
for await (const f of client.crawlStream({
  url: 'https://docs.llmlayer.ai',
  maxPages: 5,
  maxDepth: 1,
  timeoutSeconds: 30,
  formats: ['markdown'], // 'markdown' | 'html' | 'screenshot' | 'pdf'
})) {
  if (f.type === 'page') {
    const p = f.page;
    if (p.success) {
      console.log('ok:', p.final_url, 'md_len:', (p.markdown || '').length);
    } else {
      console.log('fail:', p.final_url, 'err:', p.error);
    }
  } else if (f.type === 'usage') {
    console.log('billed:', f.billed_count, 'cost:', f.cost);
  } else if (f.type === 'done') {
    console.log('done in', f.response_time, 's');
  }
}
```

> `maxPages` is an **upper bound**. You may receive fewer pages due to time budget, failures, duplicates, or shallow sites. Only **successful** pages are billed.

---

## End‑to‑End Pipelines

### Map → Crawl → Save Knowledge Base

```ts
// 1) Discover URLs
const m = await client.map({ url: 'https://docs.llmlayer.ai', limit: 200 });
for (const { link } of m.links) {
  console.log(link.url,link.title);
}
```

### Batch Screenshot a Section

```ts
const m = await client.map({ url: 'https://example.com/docs', limit: 100 });
for (const { url } of m.links) {
  const shot = await client.scrape({ url, formats: ['screenshot'] });
  if (shot.screenshot) {
    await fs.writeFile(`${new URL(url).pathname.replace(/\W+/g,'_')}.png`, Buffer.from(shot.screenshot, 'base64'));
  }
}
```

---

## Types & Imports

```ts
// Runtime
import { LLMLayerClient } from 'llmlayer';

// Types
import type { SearchRequest, AnswerResponse } from 'llmlayer/models';
import type { SearchStreamFrame, CrawlStreamFrame } from 'llmlayer/models';
```

---

## Errors

All exceptions extend `LLMLayerError`:

* `InvalidRequest` — 400 (missing/invalid params; early SSE errors like `missing_model`)
* `AuthenticationError` — 401/403 (missing/invalid LLMLayer key; provider auth issues)
* `RateLimitError` — 429
* `ProviderError` — upstream LLM provider errors
* `InternalServerError` — 5xx

**Error envelope (server)**

```json
{
  "detail": {
    "error_type": "validation_error",
    "error_code": "missing_query",
    "message": "Query parameter cannot be empty",
    "details": {"...": "optional context"}
  }
}
```

---

## Best Practices

* Use **streaming** for responsiveness; **blocking** for structured JSON.
* Start with `max_queries=1`, then raise to `2–3` for research tasks.
* Use `domain_filter` to focus search and reduce noise; exclude with `-domain.com`.
* Keep `temperature ≈ 0.3` for factual answers; raise for creative tasks.
* Prefer `search_context_size='low'` for simple queries; increase for complex topics.
* Use `provider_key` for high‑volume workloads (provider usage billed to you; `model_cost=null`).

---

## Troubleshooting

* **`answer_type: 'json'` with streaming** → not supported. Use blocking `answer()`.
* **Browser CORS** → allow `Authorization, Content-Type, Accept`; SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
* **`ERR_PACKAGE_PATH_NOT_EXPORTED`** when importing `llmlayer/dist/...` → import the package entry points (`'llmlayer'`, `'llmlayer/client'`, `'llmlayer/models'`).

---

## Builds & Runtime

* **ESM & CJS** builds; subpath exports for `client` and `models`.
* Uses global `fetch` (falls back to `undici` on Node).
* Engines: `node >= 18.17`.

**Imports**

```ts
// ESM
import { LLMLayerClient } from 'llmlayer';
import type { SearchRequest } from 'llmlayer/models';

// CJS
const { LLMLayerClient } = require('llmlayer');
```

---

## License & Support

**License:** MIT
**Issues & feature requests:** GitHub Issues
**Private support:** [support@llmlayer.ai](mailto:support@llmlayer.ai)
