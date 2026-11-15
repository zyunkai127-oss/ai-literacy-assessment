# 05 · How the pieces fit: a three-layer evidence design

2026-11-15 · Draws on the team's research report "AI Literacy 嵌入式評量框架" (evidence-centred design, 25 candidate mechanisms) and on docs 01, 02 and 04.

This repository has contained three things that were built as alternatives: a controlled scenario with planted errors, a live-collaboration mode judged from natural conversation, and an adaptive follow-up. The research report gives a reason to treat them as **three layers of one assessment**, because each can observe things the others cannot.

## 1. The three layers

| Layer | What it does | What only it can show | Where it is in the code | Status |
|---|---|---|---|---|
| **1. Passive observation** | Always on. The assistant behaves normally; the conversation and brief are reviewed afterwards | How the student directs the assistant, traces evidence and explains choices in ordinary work | Live-collaboration mode: `src/lib/model-assessment.ts`, `src/lib/collaboration.ts` | On `main` |
| **2. Embedded opportunities** | At natural points the assistant gives every student the same pre-written content, some of it wrong | Whether the student can tell right from wrong. This needs the AI to actually be wrong, in a way known in advance | Controlled scenario: pre-written summary with an altered figure, an invented reference and an unsupported causal claim; spec in `docs/01_scoring_spec.md` | Implemented at commit `e5580b4`; **not active in the current live mode** |
| **3. Active probes** | A question asked only when a competency still lacks evidence | Internal states that leave no trace: confidence, understanding | Debrief (confidence, authorship) and the adaptive follow-up | Debrief on `main`; adaptive follow-up on `feat/adaptive-follow-up` |

Why all three are needed:

- Passive observation alone cannot show discernment. If the assistant happens to make no relevant mistake, the student has no opportunity, and students cannot be compared because each saw different content.
- Embedded opportunities alone feel like a test and show best effort under warning, not ordinary habits.
- Confidence cannot be observed at all without asking.

## 2. Evidence rules shared by all layers

**Three states for every possible evidence point.** The live mode already reports these as *supported*, *practise* and *insufficient*.

1. **No opportunity.** The situation did not arise. Not scored; it only lowers the amount of evidence.
2. **Opportunity, no action.** Counts against the student only when the opportunity is diagnostic: the student committed to something, for example by putting an invented reference into the brief.
3. **Opportunity and action.** Scored by a deterministic rule or a rubric.

**Behaviour first, ability second.** Each observation records what the student did in this session. A competency is an inference from several observations, never from one.

**No evidence, no judgement.** A competency with fewer than two evidence units shows "not enough evidence in this session", not a low result.

## 3. Two kinds of result, reported separately

| | Source | Scoring | Comparable between students? | Use |
|---|---|---|---|---|
| **Anchor** | Embedded opportunities and probes | Deterministic, against a known answer | Roughly, within the same scenario | The basis for any band or type |
| **Observed profile** | Passive observation | Model-assisted judgement of meaning; the server validates message references, order and task checks | No. Opportunities differ for every student | Individual feedback only |

This is the answer to "how can a model-judged result be fair?": model judgements are used only for describing one student's session back to them, never for comparison. Anything comparable comes from content that was the same for everyone and is scored by rule.

There is still no overall score and no ranking.

## 4. What these results can and cannot support

Around ten evidence units per session is very little. By the Spearman–Brown formula, if a single unit has reliability *r*, *k* units together have reliability *kr / (1 + (k − 1)r)*:

| Assumed reliability of one unit | 2 units | 10 units |
|---|---|---|
| 0.10 | 0.18 | 0.53 |
| 0.20 | 0.33 | 0.71 |
| 0.30 | 0.46 | 0.81 |

The single-unit values are assumptions, not measurements. The table shows why results are reported as a type, a band and concrete behaviour, and why per-competency numbers are not shown.

**Can be claimed:** what this student did in this session; how they handled the standardised opportunities; a coarse formative picture.

**Cannot be claimed:** that a student "has" a level of a competency; that one student is better than another on a sub-score; that results predict other subjects or later work; anything about integrity.

## 5. Open decision: should the assistant stand by a wrong statement?

Two positions exist in the project and they conflict.

- The controlled scenario (doc 01) has the assistant **stand by** a statement when the student doubts it, to observe whether the student gives in.
- The research report's ethics rule is that the assistant **does not lie when asked directly**: if the student asks whether a reference is real, it says it cannot confirm it. Asking is then exactly the evidence wanted.

The second is easier to defend ethically and still separates students who ask from those who do not. It gives up the "noticed, then gave in" observation. The team has not decided.

## 6. Next steps, in order

1. **Bring the embedded layer into live mode.** A small number of pre-written moments, agreed in advance, disclosed at the end. Report them as the Anchor; keep the six live observations as the Observed profile.
2. **Evidence ledger for the adaptive follow-up.** Trigger a probe only for a competency with fewer than two evidence units, instead of always asking in the full version.
3. **Mechanisms from the report that reduce known confounds:**
   - *Constraint violation*: the assistant quietly breaks a condition the student stated earlier. The answer key is the student's own words, so subject knowledge matters little.
   - *Conflicting advice*: the assistant contradicts the task requirements. Replaces the second-opinion AI that was never built.
   - *Disclosure statement checked against the log* (precision and recall of declared uses), instead of wording overlap.
   - *Confidence tags* on both correct and wrong content, so being asked does not signal a problem.
   - *Verification rate* as (checked + 1) / (opportunities + 2), shown in the Observed profile only.
4. **Pilot checks before any claim of validity:** agreement between two human raters and the model on 50–100 responses; whether passive and embedded results agree; how much of the result is subject knowledge or language.
