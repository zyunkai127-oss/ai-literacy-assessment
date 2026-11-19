import { redactPII } from './guardrails';

export function activityContext(publicSources: string[], firstDraft?: string, work?: string) {
  const notes: string[] = [];
  if (firstDraft) notes.push('Submitted first draft:', redactPII(firstDraft, []).text);
  if (work) notes.push('Current student work:', redactPII(work.slice(0, 12000), []).text);
  return { system: publicSources.join('\n'), studentWork: notes.join('\n') };
}
