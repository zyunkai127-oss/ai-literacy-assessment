import { json, fail } from '@/lib/api';
import { readAssessment, updateAssessment } from '@/lib/store';
import { chatModelId, streamReply } from '@/lib/llm';
import { essayPrompt, essayQuestion, hasTaskFeedback, type Assessment, type Ratings } from '@/lib/secondary';
import { assessorPersona } from '@/lib/assessment-personas';
import { scienceMaterials, scienceReferenceFacts } from '@/lib/science-materials';
import { finaliseRatings } from '@/lib/feedback-rules';

const pending = new Map<string, Promise<Ratings>>();
async function rate(data: Assessment): Promise<Ratings> {
  const sources = await scienceMaterials(data.windPack);
  const facts = scienceReferenceFacts(data.windPack);
  const prompt = `${assessorPersona}

OUTPUT
Return only JSON keyed effective, critical, responsible, bonus. Each row has level (your overall summary), comment (one sentence of at most 10 words), next (one practical student-facing action) and tasks: {essay:{opportunity,support,level,detail,quote},science:{opportunity,support,level,detail,quote}}.
In each task, opportunity is true or false, support is none, general or specific, and level is the level for that task alone. Bonus task levels are Great or Not enough evidence.
Evaluate each task before assigning a level across the session. Each task has a brief explanation and an exact contiguous excerpt of the student's own writing that supports it. When a task shows no relevant evidence, explain the gap and use an empty quote. Missing opportunity in one task does not cancel demonstrated skill in the other.
For critical.tasks.essay, focus on one decision. If the student explicitly asked the AI to challenge a particular claim, check that claim first. To assess a revision, include draftQuote from the independent draft and revisionQuote from the revised essay, about the same idea. Compare both quotes before you say the student kept, qualified or replaced it. Keep the subject and scope of each claim as written, even when the assistant interpreted it differently. Explain that one change alone. When comparing versions, use this exact shape for critical.tasks.essay: {"opportunity":true,"support":"none","level":"Great","detail":"What changed and why it matters","quote":"Exact revised excerpt","draftQuote":"Exact original excerpt","revisionQuote":"Exact revised excerpt"}. Do not quote a short excerpt as proof that the rest of the essay kept an idea. If your evidence is only from the discussion, leave both version fields empty, quote a student message and keep the explanation about what they said in the discussion.

RUBRIC
Effective: Great for well-supported work, Fair for an incomplete comparison or reason, Need Work for missing conclusions or contradictory evidence. The science question asks for comparison with one alternative.
Critical: Great for a reasoned decision to accept, qualify or reject AI advice, Fair for recognising a disagreement with vague reasons, Need Work for adopting advice that contradicts evidence the student identified.
Responsible: Great for a specific check against the source and accurate use or correction, Fair for a partial check, Need Work for submitting a demonstrably false AI claim. An assistant's check alone isn't a student's check.
Bonus: Great for concrete evidence of deliberate management of AI context or clarification of requirements. Otherwise use Not enough evidence.

Humanities assignment
${essayPrompt}
${essayQuestion}

Science assignment and sources
${sources.join('\n')}${facts.length ? `

REFERENCE FACTS
Computed by the server from the science materials above. Use them to judge whether claims by the AI or the student are accurate. The student and the AI collaborator did not see this section.
${facts.join('\n')}` : ''}`;
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
  return finaliseRatings(result, data);
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
