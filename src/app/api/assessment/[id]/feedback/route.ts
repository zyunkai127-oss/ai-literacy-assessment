import { json, fail } from '../../../../../lib/api';
import { readAssessment, updateAssessment } from '../../../../../lib/store';
import { chatModelId, streamReply } from '../../../../../lib/llm';
import { essayPrompt, essayQuestion, type Assessment } from '../../../../../lib/secondary';
import { criteria, evidenceVersion, type EvidenceFeedback } from '../../../../../lib/assessment-scoring';
import { evidenceFormat, evidenceSources, validateEvidence } from '../../../../../lib/assessment-evidence';
import { assessorPersona } from '../../../../../lib/assessment-personas';
import { scienceMaterials, scienceReferenceFacts } from '../../../../../lib/science-materials';

const pending = new Map<string, Promise<EvidenceFeedback>>();

async function rate(data: Assessment): Promise<EvidenceFeedback> {
  const sources = await scienceMaterials(data.windPack);
  const facts = scienceReferenceFacts(data.windPack);
  const prompt = `${assessorPersona}

Return the rubric results in the supplied schema. For each dimension return one flat array with one or two items per task. Keep reason and improvement concrete and student-facing, one short sentence each. Improvement gives an action the student can take. Use an empty firstDraftQuote unless citing a paired Humanities revision. Do not assign points, deductions, percentages or ratings.
Use this rubric: ${JSON.stringify(criteria)}.

Effective: judge only the final submission. In Science, assess one alternative site and the interpretation of measurements. In the windmill field notebook task, use a second Effective observation when the student makes a distinct claim about voltage and power or energy. Addressing power or energy is optional if the assignment is otherwise met. Endorsing an inference about power or energy from voltage alone is missed. Acknowledging that the voltage readings cannot establish power or energy is accurate. Quote enough of the student's statement to establish which position they endorse.

Critical in Humanities: focus on one decision. If the student asked the AI to challenge a specific claim and both drafts address it, follow that same claim across the drafts before considering other ideas. When describing a revision, use sourceId "revision", quote the revised passage in quote, and give firstDraftQuote with the exact earlier passage about the same idea. Compare both passages to determine what the student kept, qualified or replaced. When citing a chat message, describe only what the student said during the discussion.

Responsible: use verification.kind none for a gap with no student quote. Use an empty material when unused. Use reminder {message:0,quote:""} unless there is a specific earlier reminder. In claim, give the earlier assistant message number and an exact quote of the checkable claim the student checked, corrected or repeated. Use claim {message:0,quote:""} only when the AI made no such claim; a check that tests no AI claim is not evidence for Responsible. For a demonstrated personal check choose student_initiated, after_ai_reminder, or unclear_initiator. Look first for a statement in the submission about what the student personally checked. Quote that statement verbatim, including the source name, and use only the exact source name as material. When the response also uses figures supplied by the AI, document that separately as ai_reliance. Name what the check confirmed or corrected in the reason. For after_ai_reminder, supply the earlier assistant message number and its exact reminder quote in reminder. For other kinds leave the reminder empty. When the student relies on the AI's figures or asks the AI to do the check, choose ai_reliance with empty material and reminder and outcome insufficient. Use missed only for an observable error, such as endorsing a demonstrably false claim. Merely quoting a correct result does not establish that the student verified it.

Bonus uses only met or insufficient. Mere activity, silence or writing fluency is not evidence. Copy a distinctive, exact contiguous excerpt (at most 500 characters) from the matching task in studentSources and give its exact sourceId. Reserve passages showing a source check or a specific draft change for those criteria. Use different passages to support Effective. For a gap with no quote use empty quote and sourceId.
Humanities assignment:\n${essayPrompt}\n${essayQuestion}\nScience assignment and sources:\n${sources.join('\n')}${facts.length ? `\nREFERENCE FACTS (computed by the server from the science materials; use them to judge whether claims by the AI or the student are accurate; the student and the AI collaborator did not see this section):\n${facts.join('\n')}` : ''}`;
  const { discussion, comparison } = data;
  const numbered = (messages: Assessment['discussion']) => messages.map((message, index) => ({
    ...message, message: index + 1,
  }));
  const transcript = JSON.stringify({
    studentSources: evidenceSources(data),
    discussion: numbered(discussion),
    comparison: numbered(comparison),
  });
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const regenerate = (await req.json().catch(() => null))?.regenerate === true;
  const data = readAssessment(id);
  if (!data || data.stage !== 'feedback') return fail(409, 'Finish both tasks first.');
  if (data.feedback?.schema === evidenceVersion) return json(data.feedback);
  if (!regenerate) {
    if (data.feedback) return json(data.feedback);
    if (data.ratings) return fail(409, 'Open the saved report to review it or request new feedback.');
  }
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
