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
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
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
  /\b(write|finish|complete|do|produce|generate) (it|this|the (whole |entire |full |final )?(brief|briefing|paragraph|thing|task|answer))( for me)?\b/i,
  /\bjust (write|give me) (it|the (final |finished )?(brief|paragraph|version|answer))/i,
  /\b(final|finished|submittable|ready.to.submit) (version|draft|paragraph|brief)\b/i,
  /\bfor me to (submit|hand in|paste)\b/i,
];
/** True when the student asks the assistant to produce the finished piece of work. */
export const detectGhostwrite = (text: string) => GHOSTWRITE.some((r) => r.test(text));

export const INJECTION_REPLY = "I can't share anything about how this activity is set up or assessed. I can help with the briefing itself: what would you like to work on?";
