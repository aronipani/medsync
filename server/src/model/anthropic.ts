// Strip reading with Claude (Messages API, image input, forced tool call for structured output).
// Model and key come from the environment; the key lives only in AWS (Secrets Manager / SSM), never in the app.
import { STRIP_PROMPT, STRIP_TOOL, type StripReader } from './reader.ts';

export class AnthropicReader implements StripReader {
  apiKey: () => Promise<string>;
  model: string;
  timeoutMs: number;
  constructor(apiKey: () => Promise<string>, model: string, timeoutMs = 25_000) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async read(photos: Buffer[]): Promise<unknown> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'content-type': 'application/json', 'x-api-key': await this.apiKey(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        tools: [STRIP_TOOL],
        tool_choice: { type: 'tool', name: STRIP_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              ...photos.map((p) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.toString('base64') } })),
              { type: 'text', text: STRIP_PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`model_http_${res.status}`); // status only: never log the request or answer
    const body = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
    return body.content?.find((c) => c.type === 'tool_use' && c.name === STRIP_TOOL.name)?.input;
  }
}
