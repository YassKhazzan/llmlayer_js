/*───────────────────────────── models.ts (API v2) ─────────────────────────────*/

export type AnswerType = 'markdown' | 'html' | 'json';
export type SearchType = 'general' | 'news';
export type DateFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'anytime';
export type SearchContextSize = 'low' | 'medium' | 'high';

export type ScrapeFormat = 'markdown' | 'html' | 'pdf' | 'screenshot';
export type WebSearchType = 'general' | 'news' | 'shopping' | 'videos' | 'images' | 'scholar';
export type RecencyType = 'hour' | 'day' | 'week' | 'month' | 'year';

/* ============================= Core Search ============================= */

export interface SearchRequest {
    query: string;
    model: string;

    provider_key?: string | null;
    location?: string;                 // default 'us'
    system_prompt?: string | null;
    response_language?: string;        // default 'auto'
    answer_type?: AnswerType;          // default 'markdown'
    search_type?: SearchType;          // default 'general'
    json_schema?: string | Record<string, unknown> | null; // SDK serializes objects

    citations?: boolean;
    return_sources?: boolean;
    return_images?: boolean;

    date_filter?: DateFilter;          // default 'anytime'
    max_tokens?: number;               // default 1500
    temperature?: number;              // default 0.7
    domain_filter?: string[];          // e.g. ['nytimes.com','-wikipedia.org']
    max_queries?: number;              // default 1
    search_context_size?: SearchContextSize; // default 'medium'
}

export interface AnswerResponse {
    answer: string | Record<string, unknown>;
    response_time: number | string; // server often sends formatted string "1.23"
    input_tokens: number;
    output_tokens: number;
    sources: Array<Record<string, unknown>>;
    images: Array<Record<string, unknown>>;
    model_cost?: number | null;
    llmlayer_cost?: number | null;
}

/* ============================= Search stream ============================= */
/** Frames emitted by /api/v2/answer_stream (data-only SSE; `type` drives UI) */
export type SearchStreamFrame =
    | { type: 'sources'; data: Array<Record<string, unknown>> }
    | { type: 'images'; data: Array<Record<string, unknown>> }
    | { type: 'answer'; content: string }
    | { type: 'usage'; input_tokens: number; output_tokens: number; model_cost: number | null; llmlayer_cost: number }
    | { type: 'done'; response_time: string }
    | { type: 'error'; error: string; [k: string]: unknown };

/* ============================= YouTube (v2 adds metadata) ============================= */

export interface YTResponse {
    transcript: string;
    url: string;
    title?: string | null;
    description?: string | null;
    author?: string | null;
    views?: number | null;
    likes?: number | null;
    date?: string | null;
    cost?: number | null;
    language?: string | null;
}

/* ============================= PDF content ============================= */

export interface PdfContentResponse {
    text: string;
    pages: number;
    url: string;
    statusCode: number;
    cost?: number | null;
}

/* ============================= Scrape (v2) ============================= */

export interface ScrapeResponse {
    markdown: string;                 // may be empty for non-markdown requests
    html?: string | null;
    pdf?: string | null;              // base64
    screenshot?: string | null;       // base64
    url: string;
    title?: string | null;
    statusCode: number;               // v2 camelCase
    cost?: number | null;
    metadata?: Record<string, unknown> | null;
}

/* ============================= Web search ============================= */

export interface WebSearchResponse {
    results: Array<Record<string, unknown>>;
    cost?: number | null;
}

/* ============================= Map endpoint (v2: statusCode) ============================= */

export interface MapLink {
    url: string;
    title: string;
}

export interface MapResponse {
    links: MapLink[];
    statusCode: number;
    cost?: number | null;
}

export interface MapArgs {
    url: string;
    ignoreSitemap?: boolean;
    includeSubdomains?: boolean;
    search?: string | null;
    limit?: number;
    timeoutMs?: number | null; // backend expects `timeout` in ms
}

/* ============================= Crawl stream (v2) ============================= */

export interface CrawlPage {
    requested_url?: string;
    final_url?: string;
    title?: string;
    hash_sha256?: string;
    markdown?: string | null;
    html?: string | null;
    screenshot?: string | null; // base64
    pdf?: string | null;        // base64
    success?: boolean;
    status_code?: number;
    error?: string | null;
    [k: string]: unknown; // pass-through
}

export interface CrawlArgs {
    url: string;                 // v2: single seed
    maxPages?: number;           // default 25
    maxDepth?: number;           // default 2
    timeoutSeconds?: number | null; // backend expects "timeout" seconds
    includeSubdomains?: boolean;
    includeLinks?: boolean;
    includeImages?: boolean;
    advancedProxy?: boolean;        // maps to backend advanced_proxy
    mainContentOnly?: boolean;
    formats?: ScrapeFormat[];    // which artifacts to return per page
}

/** Frames emitted by /api/v2/crawl_stream (data-only; `type` drives UI) */
export type CrawlStreamFrame =
    | { type: 'page'; page: CrawlPage }
    | { type: 'usage'; billed_count: number; unit_cost: number; cost: number }
    | { type: 'done'; response_time: string }
    | { type: 'error'; error: string; [k: string]: unknown };

/*──────────────────────────────────────────────────────────────────────*/
