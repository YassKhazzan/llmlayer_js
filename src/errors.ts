export class LLMLayerError extends Error {}
export class InvalidRequest extends LLMLayerError {}
export class AuthenticationError extends LLMLayerError {}
export class ProviderError extends LLMLayerError {}
export class RateLimitError extends LLMLayerError {}
export class InternalServerError extends LLMLayerError {}