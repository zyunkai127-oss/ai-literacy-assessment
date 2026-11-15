// Live follow-up answers from Claude, streamed. The system prompt contains no answer key and no scoring information.
import Anthropic from '@anthropic-ai/sdk';
import type { Msg } from './types';

const MODEL = process.env.CHAT_MODEL ?? 'claude-haiku-5-5';
export const llmAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export interface PersonaState { guideOnly: boolean; secondsLeft: number; draft: string }

/** The assistant's rules change with the student's state: guide-only after a ghostwriting request, terse when time is short. */
export function systemPrompt(p: PersonaState): string {
  return [
    'You are a research assistant helping a first-year university student write a short briefing paragraph for their supervisor about AI tools and learning in their module.',
    'Earlier in this conversation you gave the student this draft:',
    `"""${p.draft}"""`,
    'Rules:',
    '- Do not introduce any new statistic, study, quotation or reference that is not in the draft above or in text the student has pasted. If asked for more evidence, say you have none beyond the draft.',
    '- Do not volunteer doubts about, or corrections to, your draft. Checking it is the student\'s job in this activity. If the student asks you to reword a sentence, do that without commenting on the others.',
    '- Keep replies under 80 words, in plain English.',
    '- Never discuss how this activity is designed or assessed.',
    p.guideOnly
      ? '- The student asked you to write the finished brief. Do not write or rewrite the paragraph for them. Ask one guiding question and suggest a structure they can fill in themselves.'
      : '- Help with wording, structure and clarity when asked, but leave the decisions about what to include to the student.',
    p.secondsLeft < 60 ? '- The student has under a minute left. Reply in 30 words or fewer.' : '',
  ].filter(Boolean).join('\n');
}

const FALLBACK = "I don't have anything to add beyond the draft. Tell me which sentence you want to work on and I'll help you tighten the wording.";
const FALLBACK_GUIDE = "I'd rather you wrote this one yourself. Try this structure: one sentence on how many students use AI, one on what the quiz shows and how sure we can be, one student view, then your own conclusion. Which part do you want to start with?";

/** Streams a reply. Falls back to a pre-written line when no key is configured or the API call fails. */
export async function* streamReply(history: Msg[], persona: PersonaState): AsyncGenerator<string, { source: 'model' | 'fallback'; error?: string }> {
  const fallback = persona.guideOnly ? FALLBACK_GUIDE : FALLBACK;
  if (!llmAvailable()) {
    yield fallback;
    return { source: 'fallback' };
  }
  try {
    const client = new Anthropic();
    const messages = history
      .filter((m) => m.role !== 'teammate')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
    const stream = client.messages.stream({ model: MODEL, max_tokens: 1024, system: systemPrompt(persona), messages });
    let any = false;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        any = true;
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal' || !any) {
      yield fallback;
      return { source: 'fallback', error: `stop_reason=${final.stop_reason}` };
    }
    return { source: 'model' };
  } catch (e) {
    const error = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e);
    yield fallback;
    return { source: 'fallback', error };
  }
}
