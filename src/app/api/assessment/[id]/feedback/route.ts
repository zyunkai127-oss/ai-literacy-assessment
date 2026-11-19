import { json, fail } from '../../../../../lib/api';
import { readAssessment, updateAssessment } from '../../../../../lib/store';
import { chatModelId, streamReply } from '../../../../../lib/llm';
import { essayPrompt, essayQuestion, type Assessment } from '../../../../../lib/secondary';
import { criteria, type EvidenceFeedback } from '../../../../../lib/assessment-scoring';
import { evidenceFormat, evidenceSources, validateEvidence } from '../../../../../lib/assessment-evidence';
import { assessorPersona } from '../../../../../lib/assessment-personas';
import { scienceMaterials } from '../../../../../lib/science-materials';

const pending = new Map<string, Promise<EvidenceFeedback>>();

async function rate(data: Assessment): Promise<EvidenceFeedback> {
  const sources = await scienceMaterials(data.windPack);
  const prompt = `${assessorPersona}

Return the rubric results in the supplied schema. For each dimension, return one flat array with at least one and at most two items labelled "essay" and one or two labelled "science". Keep reason and improvement concrete and student-facing, one short sentence each. Improvement gives an action the student can take. Set firstDraftQuote to null unless citing a paired Humanities revision.
Use this rubric: ${JSON.stringify(criteria)}.
For the windmill field notebook, inspect the final science recommendation specifically for an unsupported inference from the measured voltage alone, such as claiming that a turbine could power the school or calculating energy yield from volts. If the student endorses that conclusion, set unsupportedVoltageInference to an exact contiguous quote (at most 500 characters) including both the voltage reference and the unsupported conclusion. Otherwise set it to null, including for the graph task, accurate descriptions of the voltage readings, and claims the student explicitly rejects. The server handles this observation separately. In the regular Effective items, use distinct evidence about the site comparison or recommendation.
For Effective, judge the revised submission and final recommendation, including the assigned scope of one alternative site. For Critical in Humanities, focus on one decision and check any specific claim the student asked the AI to challenge first. When describing a revision, use sourceId "revision", quote the revised passage in quote, and add firstDraftQuote containing the exact earlier passage on the same idea. Preserve the subject and scope of each quotation. If the evidence comes only from the discussion, cite the student's chat message and describe what they said there. For Responsible, an assistant's check alone does not count. Use missed for an observable mistake, such as submitting a demonstrably false AI claim; use insufficient when the criterion could not be observed. Bonus uses only met or insufficient. Mere activity, silence or writing fluency is not evidence.
For a scored item, copy a distinctive, exact contiguous excerpt of student text (at most 500 characters) from the matching task in studentSources and give its exact sourceId. Choose distinct passages for different criteria; do not reuse overlapping excerpts or the same text from a different document. Use chat transcripts for context, and never quote an assistant as the student. For insufficient items, set quote and sourceId to null. Do not assign points, deductions, percentages or ratings.
Humanities assignment:\n${essayPrompt}\n${essayQuestion}\nScience assignment and sources:\n${sources.join('\n')}`;
  const { discussion, comparison } = data;
  const transcript = JSON.stringify({ studentSources: evidenceSources(data), discussion, comparison });
  const response = streamReply([{ role: 'user', ts: Date.now(), text: transcript }], prompt, {
    thinking: chatModelId() === 'claude-haiku-5-5' ? 'low' : undefined,
    format: evidenceFormat,
  });
  let part = await response.next(), raw = '';
  while (!part.done) { raw += part.value; part = await response.next(); }
  if (part.value.error) {
    console.warn('Assessment feedback provider call failed.');
    throw Error('Feedback unavailable');
  }
  try {
    return validateEvidence(data, JSON.parse(raw));
  } catch (error) {
    console.warn('Assessment feedback did not match the expected format.');
    throw error;
  }
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
