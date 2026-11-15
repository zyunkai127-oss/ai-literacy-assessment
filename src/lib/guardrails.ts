// Code-level guardrails that run before any text reaches the model. Pure functions.

export interface PiiResult { text: string; names: string[]; other: number }

/** Replaces known classmate names, email addresses and phone numbers. Returns the redacted text and what was found. */
export function redactPII(text: string, knownNames: string[]): PiiResult {
  let out = text;
  const names: string[] = [];
  for (const full of knownNames) {
    const parts = [full, ...full.split(' ')];
    let hit = false;
    for (const p of parts) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (re.test(out)) { hit = true; out = out.replace(re, '[name removed]'); }
    }
    if (hit) names.push(full);
  }
  let other = 0;
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => { other++; return '[email removed]'; });
  out = out.replace(/(?:\+?\d[\s-]?){9,14}\d/g, () => { other++; return '[number removed]'; });
  return { text: out.replace(/(\[name removed\]\s*)+/g, '[name removed] '), names, other };
}

const INJECTION = [
  /ignore (all |any )?(previous|prior|above|your) (instructions|rules|prompt)/i,
  /(system|hidden|developer) prompt/i,
  /answer key|mark(ing)? scheme|rubric|scoring (rules|criteria)/i,
  /how (am i|will i be|are we) (being )?(scored|graded|marked|assessed)/i,
  /(planted|seeded|deliberate|intentional) (errors?|mistakes?|flaws?)/i,
  /you are now|pretend (you are|to be)|jailbreak|developer mode/i,
];
/** True when the message tries to extract the answer key, the scoring rules or the system prompt. */
export const detectInjection = (text: string) => INJECTION.some((r) => r.test(text));

const GHOSTWRITE = [
  /\b(?:write|finish|complete|produce|generate|give me) (?:the |my |a )?(?:whole |entire |full |final |finished |submittable |ready.to.submit )(?:brief(?:ing)?|draft|paragraph|version|answer)\b/i,
  /\b(?:write|finish|complete|produce|generate) (?:the |my )(?:brief(?:ing)?|paragraph|assignment) for me\b/i,
  /\b(?:write|draft|generate|produce)\b[^.!?]{0,80}\bfor me to (?:submit|hand in)\b/i,
];
/** True when the student asks the assistant to produce the finished piece of work. The assistant then switches to guide-only for the rest of the session. */
export const detectGhostwrite = (text: string) => GHOSTWRITE.some((r) => r.test(text));

/** True when a reply to the assistant's offer to write the final paragraph accepts it. */
export const detectAccept = (text: string, markers: string[]) =>
  !/\b(no|nope|not|don'?t|won'?t|rather not|i'?ll write|myself)\b/i.test(text) && markers.some((m) => new RegExp(m, 'i').test(text));

export const INJECTION_REPLY = "I can't share anything about how this activity is set up or assessed. I can help with the briefing itself: what would you like to work on?";
