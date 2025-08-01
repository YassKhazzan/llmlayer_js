export interface SearchRequest {
    provider_key?: string;
    query: string;
    model: string;
    location?: string;
    system_prompt?: string;
    response_language?: string;
    answer_type?: 'markdown' | 'html' | 'json';
    search_type?: 'general' | 'news';
    json_schema?: string;
    citations?: boolean;
    return_sources?: boolean;
    return_images?: boolean;
    date_filter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'anytime';
    max_tokens?: number;
    temperature?: number;
    domain_filter?: string[];
    max_queries?: number;
    search_context_size?: 'low' | 'medium' | 'high';
}

export interface SimplifiedSearchResponse {
    llm_response: string | object;
    response_time: number;
    input_tokens: number;
    output_tokens: number;
    sources: Array<Record<string, unknown>>;
    images: Array<Record<string, unknown>>;
    model_cost: number | null;
    llmlayer_cost: number | null;
}