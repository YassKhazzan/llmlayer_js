/*───────────────────────────── client.ts ─────────────────────────────*/
import { parseSSE } from './sse.js';
import type { Provider, SearchRequest, SimplifiedSearchResponse } from './models.js';
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
    const { fetch } = await import('undici');          // Node ≤18 polyfill
    return fetch as unknown as typeof globalThis.fetch;
}

/* ---------- error helpers ---------- */
const ERROR_MAP: Record<string, typeof LLMLayerError> = {
    validation_error: InvalidRequest,
    authentication_error: AuthenticationError,
    provider_error: ProviderError,
    rate_limit: RateLimitError,
    internal_error: InternalServerError,
};

function buildErr(
    payload: Record<string, unknown> | undefined,
    status?: number,
): LLMLayerError {
    const etype = (payload?.error_type ?? payload?.type) as string | undefined;
    const msg = (payload?.message ?? payload?.error ?? JSON.stringify(payload)) as string;
    const Exc = (etype && ERROR_MAP[etype]) || LLMLayerError;
    const err = new Exc(msg);
    // @ts-expect-error attach http status for callers who care
    if (status) err.status = status;
    return err;
}

function missing(name: string): never {
    throw new AuthenticationError(`${name} missing (set env var or pass option)`);
}

/* ---------- public client ---------- */
export interface LLMLayerClientOptions {
    apiKey?: string;
    provider?: Provider;
    providerKey?: string;
    baseURL?: string;
    timeoutMs?: number;
}

export class LLMLayerClient {
    private readonly apiKey: string;
    private readonly provider: Provider;
    private readonly providerKey: string;
    private readonly baseURL: string;
    private readonly timeout: number;
    private static readonly version = '0.1.6';        // <-- keep in sync with package.json

    constructor(opts: LLMLayerClientOptions = {}) {
        this.apiKey = opts.apiKey ?? process.env.LLMLAYER_API_KEY ?? missing('LLMLAYER_API_KEY');

        this.provider = (opts.provider ??
            (process.env.LLMLAYER_PROVIDER as Provider) ??
            'openai') as Provider;

        this.providerKey =
            opts.providerKey ??
            process.env[`${this.provider.toUpperCase()}_API_KEY`] ??
            process.env.LLMLAYER_PROVIDER_KEY ??
            missing(`${this.provider.toUpperCase()}_API_KEY`);

        this.baseURL = (opts.baseURL ?? 'https://api.llmlayer.dev').replace(/\/$/, '');
        //this.baseURL = (opts.baseURL ?? 'http://localhost:8000').replace(/\/$/, '');
        this.timeout = opts.timeoutMs ?? 60_000;
    }

    /* ────────── blocking request ────────── */
    async search(params: Omit<SearchRequest, 'provider' | 'provider_key'>): Promise<SimplifiedSearchResponse> {
        const fetch = await getFetch();
        const body: SearchRequest = { provider: this.provider, provider_key: this.providerKey, ...params };
        const res = await fetch(`${this.baseURL}/api/v1/search`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        const payload = (await res.json()) as Record<string, unknown>;
        if ('error_type' in payload) throw buildErr(payload);
        return payload as unknown as SimplifiedSearchResponse;
    }

    /* ────────── streaming request ───────── */
    async *searchStream(
        params: Omit<SearchRequest, 'provider' | 'provider_key'>,
    ): AsyncGenerator<Record<string, unknown>> {
        const fetch = await getFetch();
        const body: SearchRequest = { provider: this.provider, provider_key: this.providerKey, ...params };
        const res = await fetch(`${this.baseURL}/api/v1/search_stream`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!res.ok) await this.raiseHttp(res);
        if (!res.body) throw new LLMLayerError('No response body');

        // Text-decode the stream into lines
        const decoder = new TextDecoder();
        async function* lineGen(stream: AsyncIterable<Uint8Array>) {
            let buf = '';
            for await (const chunk of stream) {
                buf += decoder.decode(chunk, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, idx).replace(/\r$/, '');
                    buf = buf.slice(idx + 1);
                    yield line;
                }
            }
        }

        for await (const evt of parseSSE(lineGen(res.body as any))) {
            if ('error_type' in evt || 'error' in evt) throw buildErr(evt as Record<string, unknown>);
            yield evt;
        }
    }

    /* ────────── helpers ───────── */
    private headers() {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': `llmlayer-js-sdk/${LLMLayerClient.version}`,
        };
    }

    private async raiseHttp(res: Response): Promise<never> {
        let payload: Record<string, unknown> | undefined;
        try {
            payload = await res.json();
        } catch {
            throw new LLMLayerError(`${res.status} ${res.statusText}`);
        }
        throw buildErr(payload, res.status);
    }
}
/*──────────────────────────────────────────────────────────────────────*/
