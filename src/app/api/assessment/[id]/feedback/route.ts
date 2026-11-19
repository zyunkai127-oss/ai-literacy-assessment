import { json, fail } from '../../../../../lib/api';
import { readAssessment, updateAssessment } from '../../../../../lib/store';
import { chatModelId, streamReply } from '../../../../../lib/llm';
import { essayPrompt, essayQuestion, type Assessment } from '../../../../../lib/secondary';
import { criteria, type EvidenceFeedback } from '../../../../../lib/assessment-scoring';
import { evidenceSources, validateEvidence } from '../../../../../lib/assessment-evidence';
import { assessorPersona } from '../../../../../lib/assessment-personas';
import { scienceMaterials } from '../../../../../lib/science-materials';

const pending = new Map<string, Promise<EvidenceFeedback>>();

async function rate(data: Assessment): Promise<EvidenceFeedback> {
  const sources = await scienceMaterials(data.windPack);
  const prompt = `${assessorPersona}

Return only a JSON object keyed effective, critical, responsible, bonus. Each key contains an array of one or two items per task. Each item has task ("essay" or "science"), sourceId, quote, outcome ("met", "partial", "missed" or "insufficient"), reason, and improvement. Keep reason and improvement concrete and student-facing, one short sentence each. Improvement gives an action the student can take.
Use this rubric: ${JSON.stringify(criteria)}.
For Effective, judge the revised submission and final recommendation, including the assigned scope of one alternative site. For Critical in Humanities, focus on one decision and check any specific claim the student asked the AI to challenge first. When describing a revision, use sourceId "revision", quote the revised passage in quote, and add firstDraftQuote containing the exact earlier passage on the same idea. Preserve the subject and scope of each quotation. If the evidence comes only from the discussion, cite the student's chat message and describe what they said there. For Responsible, an assistant's check alone does not count. Use missed for an observable mistake, such as submitting a demonstrably false AI claim; use insufficient when the criterion could not be observed. Bonus uses only met or insufficient. Mere activity, silence or writing fluency is not evidence.
For a scored item, copy a distinctive, exact contiguous excerpt of student text (at most 500 characters) from the matching task in studentSources and give its exact sourceId. Choose distinct passages for different criteria; do not reuse overlapping excerpts or the same text from a different document. Use chat transcripts for context, and never quote an assistant as the student. For insufficient items, set quote and sourceId to null. Do not assign points, deductions, percentages or ratings.
Humanities assignment:\n${essayPrompt}\n${essayQuestion}\nScience assignment and sources:\n${sources.join('\n')}`;
  const { discussion, comparison } = data;
  const transcript = JSON.stringify({ studentSources: evidenceSources(data), discussion, comparison });
  const response = streamReply([{ role: 'user', ts: Date.now(), text: transcript }], prompt, {
    thinking: chatModelId() === 'claude-haiku-5-5' ? 'low' : undefined,
  });
  let part = await response.next(), raw = '';
  while (!part.done) { raw += part.value; part = await response.next(); }
  if (part.value.error) throw Error('Feedback unavailable');
  return validateEvidence(data, JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '')));
}

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const data = readAssessment(id);
  if (!data || data.stage !== 'feedback') return fail(409, 'Finish both tasks first.');
  if (data.feedback?.schema === 1) return json(data.feedback);
  let request = pending.get(id);
  if (!request) {
    request = rate(data);
    pending.set(id, request);
  }
  try {
    const feedback = await request;
    if (updateAssessment(id, { ...data, feedback })) return json(feedback);
    const saved = readAssessment(id)?.feedback;
    return saved ? json(saved) : fail(409, 'Your activity changed. Refresh to continue.');
  } catch {
    return fail(503, 'Feedback is temporarily unavailable.');
  } finally {
    if (pending.get(id) === request) pending.delete(id);
  }
}
