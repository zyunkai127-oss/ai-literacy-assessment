import { json, fail } from '@/lib/api';
import { readAssessment, updateAssessment } from '@/lib/store';
import { chatModelId, streamReply } from '@/lib/llm';
import { dimensions, essayPrompt, essayQuestion, hasTaskFeedback, type Assessment, type Ratings } from '@/lib/secondary';
import { assessorPersona } from '@/lib/assessment-personas';
import { scienceMaterials } from '@/lib/science-materials';

const pending = new Map<string, Promise<Ratings>>();
async function rate(data: Assessment): Promise<Ratings> {
  const sources = await scienceMaterials(data.windPack);
  const prompt = `${assessorPersona}

OUTPUT
Return only JSON keyed effective, critical, responsible, bonus. Each row has level, comment (one sentence of at most 10 words), next (one practical student-facing action) and tasks: {essay:{detail,quote},science:{detail,quote}}.
Evaluate each task before assigning a level across the session. Each task has a brief explanation and an exact contiguous excerpt of the student's own writing that supports it. When a task shows no relevant evidence, explain the gap and use an empty quote. Missing opportunity in one task does not cancel demonstrated skill in the other.
For critical.tasks.essay, focus on one decision. If the student explicitly asked the AI to challenge a particular claim, check that claim first. To assess a revision, include draftQuote from the independent draft and revisionQuote from the revised essay, about the same idea. Compare both quotes before you say the student kept, qualified or replaced it. Keep the subject and scope of each claim as written, even when the assistant interpreted it differently. Explain that one change alone. When comparing versions, use this exact shape for critical.tasks.essay: {"detail":"What changed and why it matters","quote":"Exact revised excerpt","draftQuote":"Exact original excerpt","revisionQuote":"Exact revised excerpt"}. Do not quote a short excerpt as proof that the rest of the essay kept an idea. If your evidence is only from the discussion, leave both version fields empty, quote a student message and keep the explanation about what they said in the discussion.

RUBRIC
Effective: Great for well-supported work, Fair for an incomplete comparison or reason, Need Work for missing conclusions or contradictory evidence. The science question asks for comparison with one alternative.
Critical: Great for a reasoned decision to accept, qualify or reject AI advice, Fair for recognising a disagreement with vague reasons, Need Work for adopting advice that contradicts evidence the student identified.
Responsible: Great for a specific check against the source and accurate use or correction, Fair for a partial check, Need Work for submitting a demonstrably false AI claim. An assistant's check alone isn't a student's check.
Bonus: Great for concrete evidence of deliberate management of AI context or clarification of requirements. Otherwise use Not enough evidence.

Humanities assignment
${essayPrompt}
${essayQuestion}

Science assignment and sources
${sources.join('\n')}`;
  const {draft,revision,science,discussion,comparison} = data;
  const transcript = JSON.stringify({
    humanities: { independentDraft: draft, revisedDraft: revision, discussion },
    science: { recommendation: science, discussion: comparison },
  });
  const response = streamReply([{role:'user',ts:Date.now(),text:transcript}], prompt, { thinking: chatModelId() === 'claude-haiku-5-5' ? 'low' : undefined });
  let part = await response.next(), raw = '';
  while (!part.done) { raw += part.value; part = await response.next(); }
  if (part.value.error) {
    console.warn('Assessment feedback model call failed', part.value.error);
    throw Error(part.value.error);
  }
  const result = JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,''));
  const essayMessages = discussion.filter(m => m.role === 'user').map(m => m.text);
  const words = {
    essay: [draft, revision, ...essayMessages],
    science: [science,...comparison.filter(m=>m.role==='user').map(m=>m.text)]
  };
  for (const key of Object.keys(dimensions)) {
    const row = result[key];
    const allowed = key === 'bonus' ? ['Great','Not enough evidence'] : ['Great','Fair','Need Work','Not enough evidence'];
    if (!row || !allowed.includes(row.level) || typeof row.comment !== 'string' ||
      typeof row.next !== 'string' || !row.next.trim()) throw Error('Incomplete feedback');
    let evidenceMismatch = false;
    for (const task of ['essay','science'] as const) {
      const item = row.tasks?.[task];
      if (!item || typeof item.detail !== 'string' || !item.detail.trim() || typeof item.quote !== 'string') throw Error('Missing task evidence');
      item.quote = item.quote.trim();

      if (key === 'critical' && task === 'essay') {
        const before = typeof item.draftQuote === 'string' ? item.draftQuote.trim() : '';
        const after = typeof item.revisionQuote === 'string' ? item.revisionQuote.trim() : '';
        if (before || after) {
          if (before && after && draft.includes(before) && revision.includes(after)) {
            item.draftQuote = before;
            item.revisionQuote = after;
            item.quote = after;
            continue;
          }
        } else if (item.quote && essayMessages.some(message => message.includes(item.quote))) {
          item.detail = 'This student message was recorded during the discussion. We could not verify a comparison between the two drafts for this judgement.';
          evidenceMismatch = true;
          continue;
        }
      } else if (!item.quote || words[task].some(text => text.includes(item.quote))) {
        continue;
      }

      row.tasks[task] = {detail:'We could not verify a supporting passage in this task.',quote:''};
      evidenceMismatch = true;
    }
    if (!row.tasks.essay.quote && !row.tasks.science.quote) row.level = 'Not enough evidence';
    if (row.level === 'Not enough evidence') row.comment = 'More evidence is needed for this skill.';
    else if (evidenceMismatch || !row.comment.trim() || row.comment.trim().split(/\s+/).length > 10) {
      row.comment = {Great:'Your work demonstrates this skill.',Fair:'Your work partly demonstrates this skill.','Need Work':'This skill needs more practice.'}[row.level as 'Great'|'Fair'|'Need Work'];
    }
  }
  return result;
}
export async function POST(_: Request, ctx: {params: Promise<{id:string}>}) {
  const {id} = await ctx.params;
  const data = readAssessment(id);
  if (!data || data.stage !== 'feedback') return fail(409,'Finish both tasks first.');
  if (hasTaskFeedback(data.ratings)) return json(data.ratings);
  let request = pending.get(id);
  if (!request) { request = rate(data); pending.set(id,request); }
  try {
    data.ratings = await request;
    if (!updateAssessment(id,data)) return json(readAssessment(id)?.ratings ?? data.ratings);
    return json(data.ratings);
  } catch { return fail(503,'Feedback is temporarily unavailable.'); }
  finally { if (pending.get(id) === request) pending.delete(id); }
}
