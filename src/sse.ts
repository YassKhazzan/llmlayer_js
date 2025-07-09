export async function* parseSSE(iterable: AsyncIterable<string>) {
    let buf: string[] = [];
    for await (const line of iterable) {
        if (!line) { // blank line = dispatch
            if (buf.length) {
                const payloadLines = buf.filter(l => l.startsWith('data:'));
                const data = payloadLines.map(l => l.slice(5).trim()).join('\n');
                if (data) yield JSON.parse(data);
            }
            buf = [];
            continue;
        }
        buf.push(line);
    }
}