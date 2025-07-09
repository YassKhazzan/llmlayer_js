// Helper to obtain a fetch implementation across runtimes.
export async function getFetch(): Promise<typeof globalThis.fetch> {
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch.bind(globalThis);
    }
    // Dynamic import to avoid top‑level undici dependency in browsers.
    const { fetch } = await import('undici');
    return fetch as unknown as typeof globalThis.fetch;
}
