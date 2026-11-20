import { json, fail } from '../../../../lib/api';
import { activeChats } from '../../../../lib/chatlock';
import { chatModelId, streamReply } from '../../../../lib/llm';
import { collaboratorPersona } from '../../../../lib/assessment-personas';
import { scienceMaterials } from '../../../../lib/science-materials';
import { activityContext } from '../../../../lib/activity-context';
import { essayPrompt, essayQuestion } from '../../../../lib/secondary';
import { readAssessment, updateAssessment } from '../../../../lib/store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Context) {
  const data = readAssessment((await ctx.params).id);
  return data ? json({ ...data, chatModel: chatModelId() }) : fail(404, 'Activity not found.');
}

export async function POST(req: Request, ctx: Context) {
  const { id } = await ctx.params;
  const input = await req.json().catch(() => null);
  const data = readAssessment(id);
  if (!data) return fail(404, 'Activity not found.');
  if (activeChats.has(id)) return fail(409, 'The assistant is already replying. Try again shortly.');
  if (input?.version !== data.version) return fail(409, 'Your activity changed. Refresh to continue.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) return fail(400, 'Enter between 1 and 12,000 characters.');
  const text = input.text.trim();
  if (data.stage === 'feedback') return fail(409, 'This activity is complete.');
  const save = () => updateAssessment(id, data) ? json({ ...data, chatModel: chatModelId() }) : fail(409, 'Your activity changed. Refresh to continue.');
  if (input.action === 'submit') {
    data[data.stage] = text;
    data.stage = { draft: 'revision', revision: 'science', science: 'feedback' }[data.stage] as typeof data.stage;
    return save();
  }
  if (input.action !== 'chat' || data.stage === 'draft') return fail(409, 'This action is unavailable at this stage.');

  activeChats.add(id);
  try {
    const humanities = data.stage === 'revision';
    const history = humanities ? data.discussion : data.comparison;
    const context = humanities
      ? ['Current task: HUMANITIES MODE', essayPrompt, essayQuestion]
      : ['Current task: SCIENCE MODE', ...await scienceMaterials(data.windPack)];
    const work = typeof input.work === 'string' ? input.work : undefined;
    const prompt = activityContext([collaboratorPersona, ...context], humanities ? data.draft : undefined, work);
    const message = { role: 'user' as const, text, ts: Date.now() };
    const modelMessage = prompt.studentWork ? { ...message, text: prompt.studentWork + '\nStudent message:\n' + text } : message;
    // The station log is long. Without thinking, the assistant often misread the field notebook,
    // for example reporting Manchester's lowest reading as 5 knots instead of 3, or corrected
    // itself mid-reply. Low-effort thinking reads it reliably; the larger budget leaves room for it.
    const stream = streamReply([...history, modelMessage], prompt.system,
      !humanities && data.windPack === 2 ? { thinking: 'low', maxTokens: 16000 } : {});
    let part = await stream.next();
    let reply = '';
    while (!part.done) { reply += part.value; part = await stream.next(); }
    if (part.value.error || !reply.trim()) return fail(503, part.value.error || 'The assistant returned an empty reply. Try sending your message again.');
    history.push(message, { role: 'assistant', model: part.value.model, text: reply, ts: Date.now() });
    return save();
  } catch {
    return fail(503, 'The assistant is temporarily unavailable. Try sending your message again.');
  } finally {
    activeChats.delete(id);
  }
}
