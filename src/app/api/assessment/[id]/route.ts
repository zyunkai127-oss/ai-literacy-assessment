import { json, fail } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { chatModelId, streamReply } from '@/lib/llm';
import { collaboratorPersona } from '@/lib/assessment-personas';
import { scienceMaterials } from '@/lib/science-materials';
import { activityContext } from '@/lib/activity-context';
import { essayPrompt, essayQuestion } from '@/lib/secondary';
import { readAssessment, updateAssessment } from '@/lib/store';
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
  if (activeChats.has(id) || input?.version !== data.version) return fail(409, 'Your activity changed. Refresh to continue.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) return fail(400, 'Enter between 1 and 12,000 characters.');
  const text = input.text.trim();
  if (data.stage === 'feedback') return fail(409, 'This activity is complete.');
  if (input.action === 'submit') {
    data[data.stage] = text;
    data.stage = { draft: 'revision', revision: 'science', science: 'feedback' }[data.stage] as typeof data.stage;
  } else if (input.action === 'chat' && data.stage !== 'draft') {
    const humanities = data.stage === 'revision';
    const history = humanities ? data.discussion : data.comparison;
    const context = humanities
      ? ['Current task: HUMANITIES MODE', essayPrompt, essayQuestion]
      : ['Current task: SCIENCE MODE', ...await scienceMaterials(data.windPack)];
    const work = typeof input.work === 'string' ? input.work : undefined;
    const prompt = activityContext([collaboratorPersona, ...context], humanities ? data.draft : undefined, work);
    history.push({ role: 'user', text, ts: Date.now() });
    activeChats.add(id);
    try {
      const modelHistory = prompt.studentWork
        ? [...history.slice(0, -1), { ...history[history.length - 1], text: prompt.studentWork + '\nStudent message:\n' + text }]
        : history;
      const stream = streamReply(modelHistory, prompt.system, {
        thinking: data.stage === 'science' && data.windPack === 2 ? 'disabled' : undefined,
      });
      let part = await stream.next();
      let reply = '';
      while (!part.done) { reply += part.value; part = await stream.next(); }
      if (part.value.error || !reply.trim()) return fail(503, part.value.error || 'Please retry your message.');
      history.push({ role: 'assistant', model: part.value.model, text: reply, ts: Date.now() });
    } finally { activeChats.delete(id); }
  } else return fail(409, 'This action is unavailable at this stage.');
  return updateAssessment(id, data) ? json({ ...data, chatModel: chatModelId() }) : fail(409, 'Your activity changed. Refresh to continue.');
}
