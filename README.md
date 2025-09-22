# LLMLayer JavaScript / TypeScript SDK (v0.2.0)

> **Search → Reason → Cite** with one call.
>
> Official JS/TS client for the **LLMLayer Search & Answer API**.

---

## Table of Contents

* [Overview](#overview)
* [Features](#features)
* [Requirements](#requirements)
* [Installation](#installation)
* [Answer API](#answer-api)

    * [Answer (blocking)](#answer-blocking)
    * [Streaming (SSE)](#streaming-sse)
* [Configuration](#configuration)
* [API Reference](#api-reference)

    * [Client](#class-llmlayerclient)
    * [Answer parameters (complete list)](#answer-parameters-complete-list)
    * [Streaming Events](#streaming-events)
    * [Errors](#errors)
    * [Types](#types)
* [Utilities (Detailed)](#utilities-detailed)

    * [YouTube Transcript (`getYouTubeTranscript`)](#youtube-transcript-getyoutubetranscript)
    * [PDF Content (`getPdfContent`)](#pdf-content-getpdfcontent)
    * [Scrape (`scrape`)](#scrape-scrape)
    * [Web Search (`searchWeb`)](#web-search-searchweb)
* [Advanced Tips](#advanced-tips)
* [Builds & Runtime](#builds--runtime)
* [Changelog](#changelog)
* [License](#license)
* [Support](#support)

---

## Overview

**LLMLayer** unifies web search, context building, and LLM reasoning in a single API. This SDK provides a clean, typed interface with **SSE streaming**, **POST‑based utilities**, and great DX in both Node and browsers.

---

## Features

* **Simple API**: `answer()` and `streamAnswer()` map directly to the backend.
* **Modern TS**: rich typings and enums for parameters and responses.
* **Utilities**: YouTube transcripts, PDF extraction, universal scrape (markdown/html/pdf/screenshot), and web search (general/news/images/videos/shopping/scholar).
* **Typed errors**: `InvalidRequest`, `AuthenticationError`, `RateLimitError`, `ProviderError`, `InternalServerError`.
* **Runtime agnostic**: Works in Node 18+ and modern browsers; falls back to `undici` fetch when needed.

---

## Requirements

* **Node.js ≥ 18.17** (or a modern browser)

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

---

## Answer API

### 1) Answer (blocking)

```ts
import { LLMLayerClient } from 'llmlayer';

const client = new LLMLayerClient({
  apiKey: process.env.LLMLAYER_API_KEY!,
});

const resp = await client.answer({
  query: 'Why is the sky blue?',
  model: 'openai/gpt-4.1-mini',
  return_sources: true,
});

console.log(resp.llm_response);
console.log('sources:', resp.sources?.length ?? 0);
console.log('latency (s):', resp.response_time);
```

### 2) Streaming (SSE)

```ts
import { LLMLayerClient } from 'llmlayer';

const client = new LLMLayerClient({ apiKey: process.env.LLMLAYER_API_KEY! });

for await (const event of client.streamAnswer({
  query: 'Explain brown dwarfs in two short paragraphs',
  model: 'openai/gpt-4.1-mini',
  return_sources: true,
})) {
  const t = (event as any).type;
  if (t === 'llm') process.stdout.write(String((event as any).content));
  else if (t === 'sources') console.log('\n[SOURCES]', (event as any).data?.length ?? 0);
  else if (t === 'images')  console.log('\n[IMAGES]', (event as any).data?.length ?? 0);
  else if (t === 'usage')   console.log('\n[USAGE]', event);
  else if (t === 'done')    console.log('\n✓ finished in', (event as any).response_time, 's');
}
```

> **Note:** Streaming **does not** support `answer_type="json"` (structured output). Use `answer()` for JSON responses and pass a `json_schema`.



---

## Configuration
You may pass options to the constructor or rely on environment variables (constructor wins):

| Option / Env               | Description                                              |
|---------------------------|----------------------------------------------------------|
| `apiKey` / `LLMLAYER_API_KEY`        | **Required.** Sent as `Authorization: Bearer <key>` |
| `baseURL`                 | Override API base (default `https://api.llmlayer.dev`)   |
| `timeoutMs`               | Request timeout in ms (default `60000`)                  |


---

## API Reference

### `class LLMLayerClient`
**Constructor**
```ts
new LLMLayerClient(options?: {
  apiKey?: string;
  baseURL?: string;     // default https://api.llmlayer.dev
  timeoutMs?: number;   // default 60_000
});
````

### Core Methods

```ts
answer(params: SearchRequest) => Promise<SimplifiedSearchResponse>
streamAnswer(params: SearchRequest) => AsyncGenerator<Record<string, unknown>>
```

#### Answer parameters (complete list)

*You can use **camelCase** or **snake\_case** for fields — the SDK will convert to the backend’s snake\_case automatically.*

| Param                 | Type                                                          | Default      | Description                                                                                                                                             |
| --------------------- | ------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`               | `string`                                                      | —            | **Required.** The user’s question/instruction.                                                                                                          |
| `model`               | `string`                                                      | —            | **Required.** Provider model id, e.g. `openai/gpt-4.1-mini`.                                                                                            |
| `provider_key`        | `string`                                                      | `undefined`  | Optional upstream provider key (OpenAI/Groq/…). If set here (or via client constructor as `providerKey`), usage is billed to **your** provider account. |
| `location`            | `string`                                                      | `"us"`       | Geo bias used by search.                                                                                                                                |
| `system_prompt`       | `string \| null`                                              | `null`       | Custom system prompt for non-JSON answers. If provided, the custom LLM path is used.                                                                    |
| `response_language`   | `string`                                                      | `"auto"`     | Autodetect output language or force a specific language code.                                                                                           |
| `answer_type`         | `'markdown' \| 'html' \| 'json'`                              | `"markdown"` | Output format. **If `'json'`, you must also pass `json_schema`. Not supported by streaming.**                                                           |
| `search_type`         | `'general' \| 'news'`                                         | `"general"`  | Search vertical/bias for the context builder. (For other verticals, use `searchWeb`.)                                                                   |
| `json_schema`         | `string \| object \| null`                                    | `null`       | **Required when `answer_type='json'`.** You may pass an **object**; the client will JSON-serialize it.                                                  |
| `citations`           | `boolean`                                                     | `false`      | If `true`, embed citation markers (e.g., `[1]`) in the answer body.                                                                                     |
| `return_sources`      | `boolean`                                                     | `false`      | If `true`, include aggregated `sources` in the final response and emit a `sources` event during streaming.                                              |
| `return_images`       | `boolean`                                                     | `false`      | If `true`, include `images` in the final response and emit an `images` event during streaming.                                                          |
| `date_filter`         | `'hour' \| 'day' \| 'week' \| 'month' \| 'year' \| 'anytime'` | `"anytime"`  | Recency bias for search.                                                                                                                                |
| `max_tokens`          | `number`                                                      | `1500`       | Maximum output tokens from the LLM.                                                                                                                     |
| `temperature`         | `number`                                                      | `0.7`        | Sampling temperature (creativity).                                                                                                                      |
| `domain_filter`       | `string[]`                                                    | `undefined`  | Domain constraints for search results. Include sites by name (e.g., `['nature.com']`) and exclude with a leading dash (e.g., `['-wikipedia.org']`).     |
| `max_queries`         | `number`                                                      | `1`          | How many search sub-queries the router should generate. Higher values may increase quality and cost.                                                    |
| `search_context_size` | `'low' \| 'medium' \| 'high'`                                 | `"medium"`   | Controls how much context is aggregated before hitting the LLM.                                                                                         |

> **Streaming note:** `answer_type='json'` is **not supported** by `streamAnswer`. Use blocking `answer()` for structured output and supply `json_schema`.

### Utility Methods

```ts
getYouTubeTranscript(url: string, language?: string) => Promise<YTResponse>
getPdfContent(url: string) => Promise<PdfContentResponse>
scrape(url: string, opts?: {
  format?: 'markdown' | 'html' | 'pdf' | 'screenshot';
  includeImages?: boolean;
  includeLinks?: boolean;
}) => Promise<ScrapeResponse>
searchWeb({
  query: string;
  searchType?: 'general' | 'news' | 'shopping' | 'videos' | 'images' | 'scholar';
  location?: string;
  recency?: 'hour' | 'day' | 'week' | 'month' | 'year';
  domainFilter?: string[];
}) => Promise<WebSearchResponse>
```

### Streaming Events

Your server emits JSON frames over SSE (`content-type: text/event-stream`). Possible events:

| `type`    | Payload keys                                                         | Meaning                                              |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `llm`     | `content: string`                                                    | Partial LLM text chunk                               |
| `sources` | `data: Array<Record<string, unknown>>`                               | Aggregated sources                                   |
| `images`  | `data: Array<Record<string, unknown>>`                               | Image search results                                 |
| `usage`   | `input_tokens:number`, `output_tokens:number`, \`model\_cost\:number | null`, `llmlayer\_cost\:number\`  Token/cost summary |
| `done`    | `response_time:"1.23"`                                               | Completion signal                                    |
| `error`   | `error:string`                                                       | Error frame (SDK raises)                             |

The SDK’s `streamAnswer` handles multi-line `data:` chunks, `[DONE]` sentinels, and early error frames.

### Errors

All exceptions extend `LLMLayerError`:

* `InvalidRequest` — 400 (missing/invalid params; early SSE errors like `missing_model`)
* `AuthenticationError` — 401/403 (missing/invalid LLMLayer key; provider auth issues)
* `RateLimitError` — 429
* `ProviderError` — upstream LLM provider errors
* `InternalServerError` — 5xx from LLMLayer

**Example:**

```ts
import { LLMLayerClient } from 'llmlayer';
import { AuthenticationError, InvalidRequest } from 'llmlayer/dist/errors.js';

const client = new LLMLayerClient({ apiKey: process.env.LLMLAYER_API_KEY! });

try {
  const resp = await client.answer({ query: 'hi', model: 'openai/gpt-4.1-mini' });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Auth failed:', err.message);
  } else if (err instanceof InvalidRequest) {
    console.error('Invalid params:', err.message);
  } else {
    console.error('Unexpected:', err);
  }
}
```

### Types

```ts
export interface SearchRequest {
  query: string;
  model: string;
  provider_key?: string;
  location?: string;
  system_prompt?: string | null;
  response_language?: string;         // 'auto' by default
  answer_type?: 'markdown' | 'html' | 'json';
  search_type?: 'general' | 'news';
  json_schema?: string | Record<string, unknown> | null; // dicts allowed (SDK serializes)
  citations?: boolean;
  return_sources?: boolean;
  return_images?: boolean;
  date_filter?: 'hour'|'day'|'week'|'month'|'year'|'anytime';
  max_tokens?: number;
  temperature?: number;
  domain_filter?: string[];
  max_queries?: number;
  search_context_size?: 'low'|'medium'|'high';
}

export interface SimplifiedSearchResponse {
  llm_response: string | Record<string, unknown>;
  response_time: number | string;
  input_tokens: number;
  output_tokens: number;
  sources?: Array<Record<string, unknown>>;
  images?: Array<Record<string, unknown>>;
  model_cost?: number | null;
  llmlayer_cost?: number | null;
}

export interface YTResponse {
  transcript: string;
  url: string;
  cost?: number | null;
  language?: string | null;
}

export interface PdfContentResponse {
  text: string;
  pages: number;       // number of pages
  url: string;
  status_code: number;
  cost?: number | null;
}

export interface ScrapeResponse {
  markdown: string;
  html?: string | null;
  pdf_data?: string | null;
  screenshot_data?: string | null;
  url: string;
  status_code: number;
  cost?: number | null;
}

export interface WebSearchResponse {
  results: Array<Record<string, unknown>>;
  cost?: number | null;
}
```

---

## Utilities (Detailed)

### YouTube Transcript (`getYouTubeTranscript`)

**Endpoint:** `POST /api/v1/youtube_transcript`
**Purpose:** Fetches the transcript text of a YouTube video, optionally in a specified language. Also returns pricing info when available.

**SDK Signature**

```ts
getYouTubeTranscript(url: string, language?: string): Promise<YTResponse>
// or
getYouTubeTranscript(args: { url: string; language?: string }): Promise<YTResponse>
```

**Parameters**

| Name       | Type     | Default     | Description                                                                                              |
| ---------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `url`      | `string` | —           | **Required.** Full YouTube video URL. The backend validates/extracts the video ID.                       |
| `language` | `string` | `undefined` | Optional language code (e.g., `"en"`). If omitted, backend picks the best transcript language available. |

**Returns (`YTResponse`)**

| Field        | Type             | Notes                                      |
| ------------ | ---------------- | ------------------------------------------ |
| `transcript` | `string`         | The full transcript text.                  |
| `url`        | `string`         | Echo of the input URL.                     |
| `cost`       | `number \| null` | Cost charged for this request (USD).       |
| `language`   | `string \| null` | Language actually used for the transcript. |

**Example**

```ts
const yt = await client.getYouTubeTranscript(
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'en',
);
console.log(yt.language, yt.transcript.slice(0, 200));
```

**Errors & Notes**

* `InvalidRequest` if the URL cannot be parsed (`invalid_youtube_url`).
* `InternalServerError` if scraping fails (`scraping_error`).
* Quota is checked and debited; `cost` is included for transparency.

---

### PDF Content (`getPdfContent`)

**Endpoint:** `POST /api/v1/get_pdf_content`
**Purpose:** Extracts **text** from a public PDF URL and reports the page count.

**SDK Signature**

```ts
getPdfContent(url: string): Promise<PdfContentResponse>
// or
getPdfContent({ url }: { url: string }): Promise<PdfContentResponse>
```

**Parameters**

| Name  | Type     | Default | Description                                                                               |
| ----- | -------- | ------- | ----------------------------------------------------------------------------------------- |
| `url` | `string` | —       | **Required.** Public, direct PDF URL. Backend validates it points to a real PDF resource. |

**Returns (`PdfContentResponse`)**

| Field         | Type             | Notes                                        |
| ------------- | ---------------- | -------------------------------------------- |
| `text`        | `string`         | Extracted PDF text (concatenated).           |
| `pages`       | `number`         | Total pages in the PDF.                      |
| `url`         | `string`         | Canonical URL.                               |
| `status_code` | `number`         | HTTP status from the scrape (typically 200). |
| `cost`        | `number \| null` | Cost charged for this request (USD).         |

**Example**

```ts
const pdf = await client.getPdfContent('https://arxiv.org/pdf/2203.15556.pdf');
console.log('pages:', pdf.pages);
console.log('preview:', pdf.text.slice(0, 300));
```

**Errors & Notes**

* `InvalidRequest` if the URL is not a valid/accessible PDF.
* Timeouts (\~15s) return a 504 upstream → surfaced as `InternalServerError` in SDK.
* Use this endpoint when you need **text**; for a binary PDF (base64) use `scrape(..., { format: 'pdf' })`.

---

### Scrape (`scrape`)

**Endpoint:** `POST /api/v1/scrape`
**Purpose:** Scrapes a URL into one of several formats.

**SDK Signature**

```ts
scrape(
  url: string,
  opts?: { format?: 'markdown' | 'html' | 'pdf' | 'screenshot'; includeImages?: boolean; includeLinks?: boolean },
): Promise<ScrapeResponse>
// or
scrape({ url, format, includeImages, includeLinks }: { url: string; format?: 'markdown' | 'html' | 'pdf' | 'screenshot'; includeImages?: boolean; includeLinks?: boolean }): Promise<ScrapeResponse>
```

**Parameters**

| Name            | Type                                            | Default      | Description                                    |
| --------------- | ----------------------------------------------- | ------------ | ---------------------------------------------- |
| `url`           | `string`                                        | —            | **Required.** Public URL to scrape.            |
| `format`        | `'markdown' \| 'html' \| 'pdf' \| 'screenshot'` | `"markdown"` | Output format.                                 |
| `includeImages` | `boolean`                                       | `true`       | For `markdown`, inline images (when possible). |
| `includeLinks`  | `boolean`                                       | `true`       | For `markdown`, preserve hyperlinks.           |

**Returns (`ScrapeResponse`)** *(fields depend on `format`)*

| Field             | Type             | Populated when                            |
| ----------------- | ---------------- | ----------------------------------------- |
| `markdown`        | `string`         | `format='markdown'`                       |
| `html`            | `string \| null` | `format='html'`                           |
| `pdf_data`        | `string \| null` | `format='pdf'` — base64-encoded PDF bytes |
| `screenshot_data` | `string \| null` | `format='screenshot'` — base64 PNG bytes  |
| `url`             | `string`         | Always                                    |
| `status_code`     | `number`         | Always                                    |
| `cost`            | `number \| null` | Always                                    |

**Examples**

```ts
// Markdown scrape
const md = await client.scrape('https://example.com', { format: 'markdown' });
console.log(md.markdown.slice(0, 300));

// Full HTML
const html = await client.scrape('https://example.com', { format: 'html' });
console.log(!!html.html);

// PDF (base64) → write to disk
const pdf = await client.scrape('https://example.com', { format: 'pdf' });
await import('node:fs/promises').then(fs => fs.writeFile('page.pdf', Buffer.from(pdf.pdf_data!, 'base64')));

// Screenshot (base64 PNG)
const shot = await client.scrape('https://example.com', { format: 'screenshot' });
await import('node:fs/promises').then(fs => fs.writeFile('screenshot.png', Buffer.from(shot.screenshot_data!, 'base64')));
```

**Errors & Notes**

* `InvalidRequest` for bad URLs; `InternalServerError` for scraping failures/timeouts (\~15s).
* Large base64 payloads: consider writing directly to disk (as above) to avoid memory pressure.
* `includeImages/includeLinks` only affect the **markdown** renderer.

---

### Web Search (`searchWeb`)

**Endpoint:** `POST /api/v1/web_search`
**Purpose:** Direct access to vertical search indices without invoking the full Answer pipeline.

**SDK Signature**

```ts
searchWeb({
  query: string;
  searchType?: 'general' | 'news' | 'shopping' | 'videos' | 'images' | 'scholar';
  location?: string;           // default 'us'
  recency?: 'hour' | 'day' | 'week' | 'month' | 'year';
  domainFilter?: string[];     // e.g., ['nytimes.com', '-wikipedia.org']
}): Promise<WebSearchResponse>
```

**Parameters**

| Name           | Type       | Default     | Description                                                                             |
| -------------- | ---------- | ----------- | --------------------------------------------------------------------------------------- |
| `query`        | `string`   | —           | **Required.** The search query.                                                         |
| `searchType`   | enum       | `"general"` | Vertical: `general`, `news`, `shopping`, `videos`, `images`, `scholar`.                 |
| `location`     | `string`   | `"us"`      | Geo/market bias.                                                                        |
| `recency`      | enum       | `undefined` | Recency filter (`hour`→`year`). Especially useful for `news`.                           |
| `domainFilter` | `string[]` | `undefined` | Include domains normally; **exclude** with a leading dash (e.g., `['-wikipedia.org']`). |

**Returns (`WebSearchResponse`)**

| Field     | Type                             | Notes                                                                                                                       |
| --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `results` | `Array<Record<string, unknown>>` | Each item contains fields appropriate to the vertical (e.g., `title`, `url`, `snippet`, `published_at`, `thumbnail`, etc.). |
| `cost`    | `number \| null`                 | Cost charged for this request (USD). Shopping has a higher cost tier.                                                       |

**Examples**

```ts
// General search, exclude Wikipedia
const general = await client.searchWeb({ query: 'vector databases', domainFilter: ['-wikipedia.org'] });
console.log(general.results.length);

// Recent news
const news = await client.searchWeb({ query: 'ai agents', searchType: 'news', recency: 'day' });
console.log(news.results[0]);

// Images
const images = await client.searchWeb({ query: 'james webb telescope', searchType: 'images' });
console.log(images.results.slice(0, 3));
```

**Errors & Notes**

* `InvalidRequest` if `searchType` is not one of the allowed values.
* Results schemas are **best-effort** and can vary by vertical/provider.
* Use `answer()` when you want search + LLM synthesis + citations in one call.

---

## Advanced Tips

* **`json_schema`**: You can pass a JavaScript object; the client serializes it for `answer_type='json'` (remember: not streamable).
* **Domain filters**: Include `['example.com']`, exclude with a leading dash `['-wikipedia.org']`.
* **Timeouts & headers**: Override `timeoutMs` per client; headers include `Authorization` and `Content-Type`. In Node, the SDK also sets `User-Agent`; in browsers it omits it.

---

## Builds & Runtime

* **ESM & CJS**: Package exports both `import` and `require` builds.

    * ESM: `import { LLMLayerClient } from 'llmlayer'`
    * CJS: `const { LLMLayerClient } = require('llmlayer')`
* **Fetch**: Uses global `fetch` if available; falls back to `undici` in Node.
* **SSE**: Works in Node and browsers. In browsers, streams are read via `ReadableStream.getReader()`.

---

## Changelog

**0.2.0**

* Utilities now **POST** JSON bodies: `/youtube_transcript`, `/get_pdf_content`, `/scrape`, `/web_search`.
* `scrape` unified for markdown/html/pdf/screenshot (no separate helpers).
* `web_search` returns `{ results, cost }`.
* Streaming rejects `answer_type='json'` to match server behavior; better early SSE error handling.
* Browser-friendly headers (omit `User-Agent`).

---

## License

MIT © 2025 LLMLayer Inc.

---

## Support

* **Issues & feature requests**: open a ticket on GitHub.
* For private support, contact **[support@llmlayer.ai](mailto:support@llmlayer.ai)**.
