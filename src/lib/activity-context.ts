import { redactPII } from './guardrails';

export function activityContext(publicSources: string[], firstDraft?: string, work?: string) {
  const sections = [...publicSources];
  if (firstDraft) sections.push('Submitted first draft:', redactPII(firstDraft, []).text);
  if (work) sections.push('Current student work:', redactPII(work.slice(0, 12000), []).text);
  return sections.join('\n');
}
