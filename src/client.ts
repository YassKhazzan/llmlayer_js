/*───────────────────────────── client.ts (API v2) ─────────────────────────────*/
import type {
    SearchRequest,
    AnswerResponse,
    SearchStreamFrame,
    YTResponse,
    PdfContentResponse,
    ScrapeResponse,
    WebSearchResponse,
    WebSearchType,
    RecencyType,
    ScrapeFormat,
    MapResponse,
    MapArgs,
    CrawlArgs,
    CrawlStreamFrame,
} from './models.js';
import {
    AuthenticationError,
    InvalidRequest,
    ProviderError,
    RateLimitError,
    InternalServerError,
    LLMLayerError,
} from './errors.js';

/* ---------- fetch resolver (runtime-agnostic) ---------- */
async function getFetch(): Promise<typeof globalThis.fetch> {
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    const { fetch } = await import('undici'); // Node polyfill
    return fetch as unknown as typeof globalThis.fetch;
}

/* ---------- timeout signal helper ---------- */
function timeoutSignal(ms: number): AbortSignal {
    const AnyAbortSignal = AbortSignal as any;
    if (typeof AnyAbortSignal?.timeout === 'function') return AnyAbortSignal.timeout(ms);

    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    ctrl.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
    return ctrl.signal;
}

/* ---------- snake_case conversion for SearchRequest only ---------- */
function toSnakeCase(str: string): string {
    return /[A-Z]/.test(str) ? str.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`) : str;
}
function convertKeysToSnakeCase(obj: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[toSnakeCase(k)] = v;
    return out;
}

/* ---------- request builders ---------- */
function buildSearchRequestBody(params: Record<string, any>): Record<string, any> {
    const body = convertKeysToSnakeCase(params);

    // normalize enums
    if (typeof body.answer_type === 'string') body.answer_type = body.answer_type.toLowerCase();
    if (typeof body.search_type === 'string') body.search_type = body.search_type.toLowerCase();

    // serialize json_schema if object
    if (body.json_schema && typeof body.json_schema === 'object') {
        try {
            body.json_schema = JSON.stringify(body.json_schema);
        } catch {
            // let server validate if stringify fails
        }
    }
    return body;
}

function buildMapBody(args: MapArgs): Record<string, any> {
    return {
        url: args.url,
        ignoreSitemap: args.ignoreSitemap ?? false,
        includeSubdomains: args.includeSubdomains ?? false,
        search: args.search ?? undefined,
        limit: args.limit ?? 5000,
        timeout: args.timeoutMs ?? 15000, // ms
    };
}

function buildCrawlBody(args: CrawlArgs): Record<string, any> {
    return {
        url: args.url,
        max_pages: args.maxPages ?? 25,
        max_depth: args.maxDepth ?? 2,
        timeout: args.timeoutSeconds ?? 60, // seconds
        include_subdomains: args.includeSubdomains ?? false,
        include_links: args.includeLinks ?? true,
        include_images: args.includeImages ?? true,
        formats: Array.isArray(args.formats) ? args.formats : ['markdown'],
    };
}

/* ---------- error helpers ---------- */
const ERROR_MAP: Record<string, typeof LLMLayerError> = {
    validation_error: InvalidRequest,
    authentication_error: AuthenticationError,
    provider_error: ProviderError,
    rate_limit: RateLimitError,
    internal_error: InternalServerError,

    // backend-specific
    scraping_error: InternalServerError,
    search_error: InternalServerError,
    map_error: InternalServerError,
    crawl_stream_error: InternalServerError,
};

function classForStatus(status?: number): typeof LLMLayerError {
    if (!status) return LLMLayerError;
    if (status === 400) return InvalidRequest;
    if (status === 401 || status === 403) return AuthenticationError;
    if (status === 429) return RateLimitError;
    if (status >= 500) return InternalServerError;
    return LLMLayerError;
}

function unwrapDetail(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    const d = (payload as any).detail;
    if (d && typeof d === 'object') return d;         // FastAPI { detail: {...} }
    if (typeof d === 'string') return { message: d }; // FastAPI { detail: "..." }
    return payload;
}

function buildErr(payload: any, status?: number): LLMLayerError {
    const data = unwrapDetail(payload);
    const etype = data?.error_type ?? data?.type;
    let message = data?.message ?? data?.error ?? '';
    if (!message && typeof payload?.detail === 'string') message = payload.detail;
    if (!message) message = status ? `HTTP ${status}` : 'Error';

    const Exc = (etype && ERROR_MAP[etype]) || classForStatus(status);
    const err = new Exc(message);
    if (status) (err as any).status = status;
    return err;
}

function missing(name: string): never {
    throw new AuthenticationError(`${name} missing (set env var or pass option)`);
}

/* ---------- ReadableStream → AsyncIterable adapter ---------- */
function toAsyncIterable(stream: any): AsyncIterable<Uint8Array> {
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        return stream as AsyncIterable<Uint8Array>;
    }
    const rs: ReadableStream<Uint8Array> | undefined = stream;
    if (rs && typeof (rs as any).getReader === 'function') {
        return {
            async *[Symbol.asyncIterator]() {
                const reader = rs.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) yield value;
                    }
                } finally {
                    try { reader.releaseLock?.(); } catch {}
                }
            },
        } as AsyncIterable<Uint8Array>;
    }
    throw new LLMLayerError('Unsupported response body stream');
}

/* ---------- minimal SSE data-frame parser (data-only) ---------- */
async function* iterateSSEDataFrames(iterable: AsyncIterable<Uint8Array>): AsyncGenerator<any> {
    const decoder = new TextDecoder();
    let buf = '';
    let dataBuf: string[] = [];

    for await (const chunk of iterable) {
        buf += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);

            if (line === '') {
                // end of event
                if (dataBuf.length > 0) {
                    const raw = dataBuf.join('').trim(); // join WITHOUT newlines to avoid JSON corruption
                    dataBuf = [];
                    if (raw) {
                        try {
                            yield JSON.parse(raw);
                        } catch {
                            // ignore malformed
                        }
                    }
                }
                continue;
            }
            if (line.startsWith(':')) continue;           // comment
            if (line.startsWith('data:')) {
                dataBuf.push(line.slice(5));                // preserve spacing
            }
            // ignore other SSE fields since backend emits data-only
        }
    }

    // flush trailing buffer
    if (buf.length > 0) {
        const last = buf.replace(/\r?\n$/, '');
        if (last.startsWith('data:')) {
            const raw = last.slice(5);                    // preserve spacing
            if (raw) {
                try { yield JSON.parse(raw); } catch {}
            }
        }
    }
}

/* ---------- public client ---------- */
export interface LLMLayerClientOptions {
    /** Your LLMLayer account key (required). */
    apiKey?: string;
    /** Override the default LLMLayer endpoint. */
    baseURL?: string;
    /** Request timeout in milliseconds (default = 60_000). */
    timeoutMs?: number;
}

export class LLMLayerClient {
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly timeout: number;
    private static readonly version = '0.4.0'; // keep in sync with package.json

    constructor(opts: LLMLayerClientOptions = {}) {
        this.apiKey = opts.apiKey ?? process.env.LLMLAYER_API_KEY ?? missing('LLMLAYER_API_KEY');
        this.baseURL = (opts.baseURL ?? 'https://api.llmlayer.dev').replace(/\/$/, '');
        this.timeout = opts.timeoutMs ?? 60_000;
    }

    /* =======================================================================
     * Core Answer APIs (POST) — v2
     * ======================================================================= */

    /** Blocking answer call → AnswerResponse */
    async answer(params: SearchRequest): Promise<AnswerResponse> {
        const fetch = await getFetch();
        const body = buildSearchRequestBody(params as Record<string, any>);

        const res = await fetch(`${this.baseURL}/api/v2/answer`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = (await res.json()) as any;
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as AnswerResponse;
    }

    /** Streaming answer via SSE → yields SearchStreamFrame objects (type: 'answer'|'sources'|'images'|...) */
    async *streamAnswer(params: SearchRequest): AsyncGenerator<SearchStreamFrame> {
        const at = (params as any).answer_type ?? (params as any).answerType;
        if (typeof at === 'string' && at.toLowerCase() === 'json') {
            throw new InvalidRequest("Streaming does not support structured JSON output (answer_type='json').");
        }

        const fetch = await getFetch();
        const body = buildSearchRequestBody(params as Record<string, any>);

        const res = await fetch(`${this.baseURL}/api/v2/answer_stream`, {
            method: 'POST',
            headers: this.headers({ acceptSSE: true }),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        if (!res.body) throw new LLMLayerError('No response body');

        const iterable = toAsyncIterable(res.body as any);
        for await (const frame of iterateSSEDataFrames(iterable)) {
            const data = unwrapDetail(frame);
            const simple = (data as any)?.error;
            if (simple) {
                const s = String(simple).toLowerCase();
                if (s === 'missing_model' || s === 'missing_query' || s === 'invalid_model' || s.includes('structured output')) {
                    throw new InvalidRequest(String(simple));
                }
                throw new LLMLayerError(String(simple));
            }
            if ((data as any)?.type === 'error' || (data as any)?.error_type) {
                throw buildErr(data as any);
            }
            yield data as SearchStreamFrame;
        }
    }

    /* =======================================================================
     * Utility endpoints (POST bodies) — v2
     * ======================================================================= */

    async getYouTubeTranscript(args: { url: string; language?: string }): Promise<YTResponse>;
    async getYouTubeTranscript(url: string, language?: string): Promise<YTResponse>;
    async getYouTubeTranscript(a: any, b?: any): Promise<YTResponse> {
        const fetch = await getFetch();
        const body = typeof a === 'string' ? { url: a, language: b } : { url: a.url, language: a.language };

        const res = await fetch(`${this.baseURL}/api/v2/youtube_transcript`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = await res.json();
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as YTResponse;
    }

    async getPdfContent(args: { url: string }): Promise<PdfContentResponse>;
    async getPdfContent(url: string): Promise<PdfContentResponse>;
    async getPdfContent(a: any): Promise<PdfContentResponse> {
        const fetch = await getFetch();
        const body = typeof a === 'string' ? { url: a } : { url: a.url };

        const res = await fetch(`${this.baseURL}/api/v2/get_pdf_content`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = await res.json();
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as PdfContentResponse;
    }

    async scrape(args: {
        url: string;
        formats?: ScrapeFormat[];         // v2: multiple formats
        includeImages?: boolean;
        includeLinks?: boolean;
    }): Promise<ScrapeResponse>;
    async scrape(
        url: string,
        opts?: { formats?: ScrapeFormat[]; format?: ScrapeFormat; includeImages?: boolean; includeLinks?: boolean },
    ): Promise<ScrapeResponse>;
    async scrape(a: any, b?: any): Promise<ScrapeResponse> {
        const fetch = await getFetch();
        const isString = typeof a === 'string';
        const url = isString ? (a as string) : a.url;
        const opts = (isString ? b : a) ?? {};
        const formats: ScrapeFormat[] = Array.isArray(opts.formats)
            ? opts.formats
            : [opts.format ?? 'markdown'];

        const body = {
            url,
            formats,
            include_images: opts.includeImages ?? true,
            include_links: opts.includeLinks ?? true,
        };

        const res = await fetch(`${this.baseURL}/api/v2/scrape`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = await res.json();
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as ScrapeResponse;
    }

    async searchWeb(args: {
        query: string;
        searchType?: WebSearchType;
        location?: string;
        recency?: RecencyType;
        domainFilter?: string[];
    }): Promise<WebSearchResponse> {
        const fetch = await getFetch();
        const body = {
            query: args.query,
            search_type: args.searchType ?? 'general',
            location: args.location ?? 'us',
            recency: args.recency,
            domain_filter: args.domainFilter,
        };

        const res = await fetch(`${this.baseURL}/api/v2/web_search`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = await res.json();
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as WebSearchResponse;
    }

    /* =======================================================================
     * Map (POST) — v2 (`statusCode`)
     * ======================================================================= */

    async map(args: MapArgs): Promise<MapResponse>;
    async map(url: string, opts?: Omit<MapArgs, 'url'>): Promise<MapResponse>;
    async map(a: any, b?: any): Promise<MapResponse> {
        const fetch = await getFetch();
        const args: MapArgs = typeof a === 'string' ? { ...(b ?? {}), url: a } : a;
        const body = buildMapBody(args);

        const res = await fetch(`${this.baseURL}/api/v2/map`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = await res.json();
        const data = unwrapDetail(payload);
        if (data && (data.error_type || data.error)) throw buildErr(payload, res.status);
        return payload as MapResponse;
    }

    /* =======================================================================
     * Crawl stream (POST) — v2 (`url` + `formats`, frames: page/usage/done/error)
     * ======================================================================= */

    async *crawlStream(args: CrawlArgs): AsyncGenerator<CrawlStreamFrame> {
        const fetch = await getFetch();
        const body = buildCrawlBody(args);

        const res = await fetch(`${this.baseURL}/api/v2/crawl_stream`, {
            method: 'POST',
            headers: this.headers({ acceptSSE: true }),
            body: JSON.stringify(body),
            signal: timeoutSignal(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        if (!res.body) throw new LLMLayerError('No response body');

        const iterable = toAsyncIterable(res.body as any);
        for await (const frame of iterateSSEDataFrames(iterable)) {
            const data = unwrapDetail(frame);
            if ((data as any)?.type === 'error' || (data as any)?.error_type) {
                throw buildErr(data as any);
            }
            const simple = (data as any)?.error;
            if (simple && typeof simple === 'string') throw new LLMLayerError(simple);
            yield data as CrawlStreamFrame;
        }
    }

    /* =======================================================================
     * Back-compat aliases (deprecated)
     * ======================================================================= */

    /** @deprecated use answer() */
    async search(params: SearchRequest): Promise<AnswerResponse> {
        // eslint-disable-next-line no-console
        console.warn('[llmlayer] search() is deprecated; use answer()');
        return this.answer(params);
    }

    /** @deprecated use streamAnswer() */
    async *searchStream(params: SearchRequest): AsyncGenerator<SearchStreamFrame> {
        // eslint-disable-next-line no-console
        console.warn('[llmlayer] searchStream() is deprecated; use streamAnswer()');
        for await (const e of this.streamAnswer(params)) yield e;
    }

    /* ---------- internals ---------- */
    private headers(opts?: { acceptSSE?: boolean }) {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };
        if (opts?.acceptSSE) h['Accept'] = 'text/event-stream';
        if (typeof window === 'undefined') {
            h['User-Agent'] = `llmlayer-js-sdk/${LLMLayerClient.version}`;
        }
        return h;
    }

    private async raiseHttp(res: Response): Promise<never> {
        let payload: Record<string, unknown> | undefined;
        try {
            payload = await res.json();
        } catch {
            const err = new LLMLayerError(`${res.status} ${res.statusText}`);
            const rid = res.headers?.get?.('x-request-id');
            if (rid) err.message += ` (request_id=${rid})`;
            throw err;
        }
        const err = buildErr(payload, res.status);
        const rid = res.headers?.get?.('x-request-id');
        if (rid) err.message += ` (request_id=${rid})`;
        throw err;
    }
}
/*──────────────────────────────────────────────────────────────────────*/
