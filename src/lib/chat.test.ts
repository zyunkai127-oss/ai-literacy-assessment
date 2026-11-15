import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmAvailable, streamReply, systemPrompt } from './llm';
import { scenario } from './scenario';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('live chat', () => {
  it('grounds chat in the original project and anonymised source pack', () => {
    const prompt = systemPrompt();
    expect(prompt).toContain(scenario.task.title);
    expect(prompt).toContain(scenario.task.prompt);
    for (const requirement of scenario.task.requirements) expect(prompt).toContain(requirement);
    expect(prompt).toContain('27 of 48 respondents (56%)');
    expect(prompt).toContain('No causal conclusion');
    expect(prompt).not.toContain('Marlowe');
    for (const name of scenario.names) expect(prompt).not.toContain(name);
  });

  it('treats empty credentials as unavailable', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' ');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    expect(llmAvailable()).toBe(false);
  });

  it('reports model access failures without returning provider payloads as chat replies', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'provider debug info' } }, { status: 404 })));
    const reply = streamReply([{ role: 'user', text: 'What did the survey find?', ts: 0 }]);
    const result = await reply.next();
    expect(result.done).toBe(true);
    expect(result.value).toEqual({ error: 'Live chat could not access the configured AI model.' });
  });
});
