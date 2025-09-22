/*───────────────────────────── models.ts ─────────────────────────────*/

export type AnswerType = 'markdown' | 'html' | 'json';
export type SearchType = 'general' | 'news';
export type DateFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'anytime';
export type SearchContextSize = 'low' | 'medium' | 'high';

export type ScrapeFormat = 'markdown' | 'html' | 'pdf' | 'screenshot';
export type WebSearchType = 'general' | 'news' | 'shopping' | 'videos' | 'images' | 'scholar';
export type RecencyType = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface SearchRequest {
    query: string;
    model: string;
    provider_key?: string;
    location?: string;                  // default 'us'
    system_prompt?: string | null;
    response_language?: string;         // default 'auto'
    answer_type?: AnswerType;           // default 'markdown'
    search_type?: SearchType;           // default 'general'
    json_schema?: string | Record<string, unknown> | null; // client may serialize dicts
    citations?: boolean;
    return_sources?: boolean;
    return_images?: boolean;
    date_filter?: DateFilter;           // default 'anytime'
    max_tokens?: number;                // default 1500
    temperature?: number;               // default 0.7
    domain_filter?: string[];           // e.g., ['nytimes.com','-wikipedia.org']
    max_queries?: number;               // default 1
    search_context_size?: SearchContextSize; // default 'medium'
}

export interface SimplifiedSearchResponse {
    llm_response: string | Record<string, unknown>;
    response_time: number | string; // server often sends formatted string "1.23"
    input_tokens: number;
    output_tokens: number;
    sources?: Array<Record<string, unknown>>;
    images?: Array<Record<string, unknown>>;
    model_cost?: number | null;
    llmlayer_cost?: number | null;
}

/* ===================== Utilities: YouTube ===================== */

export interface YTResponse {
    transcript: string;
    url: string;
    cost?: number | null;
    language?: string | null;
}

/* ===================== Utilities: PDF Content ===================== */

export interface PdfContentResponse {
    text: string;
    pages: number;             // UPDATED: now a number, not an array
    url: string;
    status_code: number;
    cost?: number | null;
}

/* ===================== Utilities: Scrape ===================== */

export interface ScrapeResponse {
    markdown: string;          // may be empty for non-markdown formats
    html?: string | null;
    pdf_data?: string | null;        // base64
    screenshot_data?: string | null; // base64
    url: string;
    status_code: number;
    cost?: number | null;
}

/* ===================== Utilities: Web Search ===================== */

export interface WebSearchResponse {
    results: Array<Record<string, unknown>>;
    cost?: number | null;
}
/*──────────────────────────────────────────────────────────────────────*/
