import pack from '@/lib/wind-pack.json';
import { readFile } from 'node:fs/promises';
import { json, fail } from '@/lib/api';
import { activeChats } from '@/lib/chatlock';
import { chatModelId, streamReply } from '@/lib/llm';
import { summariseWindLog } from '@/lib/wind-log';
import { activityContext } from '@/lib/activity-context';
import { essayPrompt, essayQuestion, windEvidence, windQuestion } from '@/lib/secondary';
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
    const history = data.stage === 'revision' ? data.discussion : data.comparison;
    let context = [windQuestion, ...windEvidence];
    if (data.stage === 'revision') {
      context = [essayPrompt, essayQuestion];
    } else if (data.windPack === 2) {
      const csv = await readFile(process.cwd() + '/public/wind/station-log.csv', 'utf8');
      context = [
        pack.context,
        'Distinguish a comparison threshold from a measured turbine cut-in speed. The windmill test reports voltage; it does not establish a cut-in speed or energy yield.',
        summariseWindLog(csv),
        'station-log.csv (original public station log, UTC, knots)',
        csv,
      ];
    }
    const prompt = activityContext(context, data.stage === 'revision' ? data.draft : undefined, typeof input.work === 'string' ? input.work : undefined);
    history.push({ role: 'user', text, ts: Date.now() });
    activeChats.add(id);
    try {
      const modelHistory = prompt.studentWork
        ? [...history.slice(0, -1), { ...history[history.length - 1], text: prompt.studentWork + '\nStudent message:\n' + text }]
        : history;
      const stream = streamReply(modelHistory, prompt.system, {
        disableThinking: data.stage === 'science' && data.windPack === 2,
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
