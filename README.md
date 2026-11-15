# AI Literacy Check

## How the pieces fit

This project assesses how a student works with AI through three layers of evidence. Each shows something the others cannot.

| Layer | What it shows | Status |
|---|---|---|
| Passive observation of a live conversation | How the student directs the assistant, traces evidence and explains choices | Current mode on `main` |
| Embedded opportunities: the same pre-written content for every student, some of it wrong | Whether the student can tell right from wrong | Built as the controlled scenario (commit `e5580b4`, spec in `docs/01_scoring_spec.md`); not active in the current live mode |
| Active probes, asked only where evidence is missing | Confidence and understanding, which leave no trace | Debrief on `main`; adaptive follow-up on `feat/adaptive-follow-up` |

Model-assisted judgements are used only to describe one student's session back to them. Anything comparable between students must come from standardised content scored by rule. There is no overall score and no ranking. The reasoning, what the results can and cannot support, and the next steps are in [`docs/05_three_layer_framework.md`](docs/05_three_layer_framework.md).

## Current live-collaboration mode

The assistant now has the full source pack, task requirements and anonymised comments. Every ordinary message, including the first, receives a live model response. The chat prompt is: “The assistant has all the sources and task requirements. Tell it what you want help with.”

Automatic research summaries, planted-error stand-by replies and timed ghost-writing offers are disabled. Requests for the finished paragraph still receive guidance, and the privacy and prompt-injection guardrails remain active. Live chat requires the configured API credentials.

After submission, students report confidence and authorship. The full version freezes this core-task feedback, then runs up to two adaptive follow-up questions. Results show six AI-assisted observations: directing the assistant, tracing evidence, explaining choices, calibrating conclusions, describing AI contribution and following through on review. Each shows observed evidence, a reflection point or insufficient evidence, with its criterion. There is no total score or ranking. Task-completion checks remain separate. Message counts and source opens do not earn positive feedback. The assessor reviews meaning and context and returns structured message references; the server validates references, reply order and task-completion requirements. Failed or malformed assessments are shown as unavailable, without substituting keyword judgements. These observations are prototype feedback, not validated measures of ability.

Optional storage still controls whether student messages and free-text work are retained after completion. Existing completed results are snapshots of the version used at the time.

## Adaptive follow-up (local prototype)

The full version uses three separate model roles: an observer identifies answer evidence, a planner selects the next action from a server-owned question bank, and an independent verifier checks the observation and proposed action. The planner can deepen a clear explanation, provide general or specific support, finish, or escalate. Follow-up currently targets evidence tracing, causal interpretation and reasoned choices. A maximum of two student questions and two planning attempts bounds each path.

Every role creates a persisted checkpoint with latency and token usage. Observer/verifier disagreement, repeated invalid plans or unresolved two-round ambiguity pauses the flow for a teacher. `/ops` has a separate review-key login (`OPS_REVIEW_KEY` on the server): the reviewer can inspect redacted evidence, confirm or override the latest outcome, choose an allowed follow-up and resume, or finish with reviewed feedback. Individual review evidence is unavailable without teacher authentication. API failures keep answers recoverable and offer retry or available feedback.

Results keep the common-core feedback unchanged. Follow-up observations separately record the target, question/answer ID, outcome, support condition (no content hint / general hint / specific help) and automatic/human review status. They are not a total score and cannot be directly compared across different questions or support levels. Non-consenting sessions clear their raw brief, chat and adaptive answers on completion.

A provisional evaluation set has 12 synthetic scenarios with three wordings each. With the app running, run `OPS_REVIEW_KEY=... node scripts/evaluate-adaptive.mjs`, or use the authenticated benchmark button in `/ops`. It reports expected-label matches, verifier agreement, false positives/negatives, unavailable calls and latency; the local report is ignored by Git. These labels require expert validation and are not evidence that the feedback measures student ability. `/ops` retains system telemetry and benchmark attempts, including unavailable calls.

## Earlier controlled-scenario reference

The sections below describe the controlled scenario and its scoring specification. This is the embedded-opportunity layer described under "How the pieces fit". The current live mode does not run its scripted chat or show its results page. The installation commands remain applicable.

A prototype for the Reply Student Tech Clash "AI on Campus" challenge (Track A, full-stack engineering).

## The problem

Students use AI for coursework, but assessment looks only at the finished piece. It cannot tell a student who checked what the AI said from one who accepted everything. Students get no feedback on how they work with AI.

## What this does

A student completes one small, timed piece of work with an AI research assistant: a briefing paragraph for a supervisor, written from a fictional source pack. The session mixes a natural workflow with a few controlled moments:

- **The first task instruction returns a pre-written research summary.** Its statements are listed one by one with Insert buttons. Three are wrong (an altered figure, an invented reference, a causal claim the data cannot support) and the rest are correct, including one that looks suspicious but is right. Every student sees the same statements.
- **Doubting a specific statement gets a pre-written reply in which the assistant stands by it**, right or wrong.
- **Everything else is free chat with a live model.** The model sees the task, the anonymised survey comments and the summary it "wrote". It does not see the three evidence sources, so asking it is not a free way to verify.
- **All three evidence sources can be read.** They are written as documents (a survey report, a quiz note with a method note, a reading list), so checking a statement means finding it. Which sources were opened, and when, is logged.
- **Later the assistant offers to write the final paragraph**, which the assignment does not allow. If the student accepts, it does write one: a pre-written paragraph built from its own summary, wrong statements included. What counts is whether that wording is handed in, not whether the student said yes.
- After submitting, a **one-screen debrief** asks, for each statement, Relied on it / Not sure / Didn't rely on it (at most two "Not sure"), overall confidence, and who wrote most of the wording. The full version adds one follow-up question chosen from those answers.

The summary, the stand-by replies and the offer need no API key, so the whole measurement runs offline. Only free chat needs the live model.

### What the results show

There is **no overall score, no percentage and no ranking**. The results page shows, in order: one headline moment, a four-part profile, a statement-by-statement review (each with its criterion, the evidence from this session and what was true), up to three suggestions, a checklist for the brief itself, and the full list of statements marked Wrong or Correct.

| Part of the profile | What it reports | How |
|---|---|---|
| Discern | A type: Calibrated, Sceptical, Credulous or Misplaced, with the raw counts | Hits and misses on wrong statements, false alarms and correct acceptances on right ones. Needs at least 2 wrong and 1 correct statement that were used, questioned or rejected; otherwise "Not enough evidence" |
| Decide | A band: Emerging, Developing or Proficient | Beta posterior over the moments where the student had to act on a doubt (kept a doubted statement out; named a wrong statement among the least-sure points; confidence in line with accuracy). Flags a wide interval. Capped at Developing after a confident error |
| Own | A checklist: classmates' personal data, writing the final paragraph yourself, describing AI use accurately, errors in the submitted work; plus the follow-up answer rated specific / general / no reason | ✓, ✗ or not observed |
| Direct | Which of topic, length, sources and audience the first instruction specified | Shown only, not graded |

Opening a source never counts as a judgement on its own, and silently leaving a statement out is not scored either way. Saying in the chat that a statement is wrong counts the same as marking it "Didn't rely on it".

The full specification, with five worked students used as unit tests, is in [`docs/01_scoring_spec.md`](docs/01_scoring_spec.md). The rationale is in [`docs/02_model.md`](docs/02_model.md), and the decisions behind this merged version are in [`docs/04_merge_strategy.md`](docs/04_merge_strategy.md) (the docs are in Chinese). One deliberate difference from the spec: for the altered figure and the invented reference, a sentence that explicitly rejects the statement ("65% is wrong") does not count as using it.

## Run it

Requires Node 22.13 or later (it uses Node's built-in SQLite).

```bash
npm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # chat context, scoring, guardrails and session state
```

Add a valid Anthropic API key to `.env.local` and restart the dev server to enable live chat. The default Claude API model is `claude-haiku-5-5`. With no credentials, the research summary, the assistant's stand-by replies, the offer and the guardrail replies still work; only free chat reports "Live AI chat is unavailable".

- `/` consent and choice of version (quick: 4 minutes, full: 8 minutes)
- `/s/:id` the session
- `/ops` guardrail triggers and actions, reading-budget blocks, offer responses, response latency and session counts

Delete `data/app.db` to clear all sessions. Do this once when moving to this version: sessions stored by earlier versions are not compatible.

## How it is built

Next.js (App Router), TypeScript, SQLite, Anthropic API.

```
data/scenario.json        the whole scenario and its answer key, in one file
src/lib/scoring.ts        pure scoring functions
src/lib/guardrails.ts     pure guardrail checks
src/lib/machine.ts        session state machine
src/lib/store.ts          SQLite: sessions and the event log
src/lib/llm.ts            system prompt, message assembly, streamed model replies and service errors
src/lib/scenario.ts       server-only loader; strips the answer key for the browser
src/lib/chatlock.ts       one assistant reply per session at a time
src/app/api/...           route handlers
src/app/s/[id]/...        the session page: Intro, Work, Debrief, Reveal
docs/                     scoring spec, model rationale, refactor guide, merge decisions
```

**Session state** lives on the server: `consent → intro → work → debrief → reveal` in the quick version and `consent → intro → work → debrief → viva → reveal` in the full version. Requests made in the wrong state get a 409. Scoring happens once, when the session moves to `reveal`.

**Setting and marking are separate.** The answer key exists only in `data/scenario.json` and is read only by server code. `scoring.ts` and `scenario.ts` are never imported by a client component. The assistant's system prompt contains no information about which statements are wrong. No endpoint returns roles, markers or reveal text until the session reaches `reveal`, and the text of an evidence source is sent only after that session has opened it.

**Scripted and live replies are separate.** The summary, stand-by replies, offer and guardrail replies are returned verbatim from the scenario or from code, so a model can never quietly correct them. Free chat goes to the model with the task, the anonymised survey comments and the summary as context. Adjacent same-role messages are merged before the API call, and messages blocked by the injection guardrail are left out.

**Event log.** Every consent, message, source opened, budget block, draft snapshot, guardrail trigger, offer and response, submission, debrief and score is stored with a timestamp.

### API

| Method and path | Purpose |
|---|---|
| `POST /api/sessions` | Create a session after consent. Body: `{mode, understood, store}` |
| `GET /api/sessions/:id` | Session as the browser may see it: messages, statements once the summary has appeared, opened evidence, remaining budget, the follow-up question when in `viva` |
| `POST /api/sessions/:id/start` | Start the clock |
| `POST /api/sessions/:id/chat` | Send a message. Responds with a server-sent event stream (`guardrail`, `delta`, `message`, `error`, `done`). Returns 503 only when the message needs free chat and no model is configured |
| `POST /api/sessions/:id/event` | `pack_open` returns `{ok, body, remaining}`; the budget is currently set to all three sources, so nothing is blocked; a lower `budget` in `data/scenario.json` would return 409 `{error: "budget", remaining: 0}`. `draft` stores an editor snapshot |
| `POST /api/sessions/:id/scripted` | Delivers the assistant's timed offer once, when due |
| `POST /api/sessions/:id/submit` | Submit the brief. Moves to `debrief` |
| `POST /api/sessions/:id/debrief` | Body: `{decisions: {claimId: "relied" \| "unsure" \| "not"}, confidence: 0-100, declared: "MINE" \| "MIXED" \| "AI"}`. Quick version: scores and moves to `reveal`. Full version: returns the follow-up question and moves to `viva` |
| `POST /api/sessions/:id/viva` | Full version. Body: `{answer}` (up to 1000 characters). Scores and moves to `reveal` |
| `GET /api/sessions/:id/result` | The reveal: profile, statement review, suggestions, group comparison. No total and no percentages |
| `GET /api/ops` | Operational figures |

### Guardrails

All three run in code before anything reaches the model, and each changes what the assistant does.

| Guardrail | Trigger | Action |
|---|---|---|
| Personal data | Classmate names, email addresses, phone numbers in a message | Redacted before storage and transmission; the student is told. The survey comments in the system prompt are anonymised too |
| Prompt injection | Requests for the system prompt, answer key, marking rules, or to ignore instructions | Fixed refusal. The message is never sent to the model, including as later history |
| Ghost-writing | The student asks, unprompted, for the finished brief | The assistant declines and stays in guide-only mode for the rest of the session. (Accepting the assistant's own timed offer is different: it writes a pre-written paragraph, and the results compare the submitted brief with it) |

The model is also told to reply in 30 words or fewer when under a minute is left.

## Ethics

- Before starting, the student is told "The AI in this activity may sometimes be wrong" and must confirm they understand.
- Storing the session is a separate, optional choice. Without it, the student's messages, brief and free-text snapshots are deleted from app storage when they finish. Derived scoring evidence remains available to them and they are left out of the group comparison.
- Every wrong statement the assistant made is revealed at the end, with the correct information.
- There is no overall score and no ranking.
- Planted errors are confined to a fictional module. The invented reference carries a publication year in the future and names no real person or journal.
- Feedback is addressed to the student and describes this session only.

## APIs used

- Anthropic Messages API (streaming), model `claude-haiku-5-5`, through `@anthropic-ai/sdk`. Used for free chat only. Redacted messages, the task, the anonymised survey comments and the pre-written summary are sent to the provider.

No other external services.

## Known limitations

- **A student who ignores the AI and writes from the sources cannot be told apart yet** from one who used the AI well. The source pack is short and the assistant's correct statements match it word for word, so both end up with the same profile. Fixing this needs an assistant that adds something the sources do not hand over directly.
- **This measures best effort, not habit.** Students are warned the AI may be wrong. What they do unprompted needs observation inside real coursework, over several occasions.
- **Very few observations per person.** Only a type and a band are reported, and a wide interval is flagged.
- **Planted factual errors will date** as models improve. The judgement points will need to move towards "is this appropriate here".
- **No threshold is calibrated yet.** All of them are in `data/scenario.json`.
- **The brief is matched with patterns.** Heavy rewording can be misread, which is why the core evidence comes from explicit choices at the debrief. Doubt detection in chat is keyword-based too: a question that names a statement and contains a doubt word counts as questioning it.
- **The live model can still hint that the summary is wrong.** It does not see the evidence sources and is told not to add figures, but it is not scripted.
- **Only in-app activity is visible.** Reading elsewhere and edits between autosave snapshots leave no trace.
- **The offer needs time to appear.** It comes 90 seconds (quick) or 240 seconds (full) after the summary. A student who submits earlier never sees it, and that check shows "not observed".
- **Group comparison is limited** to consenting sessions in the same version from the last 24 hours, and appears only with at least five.
- **Not built yet:** the second-opinion AI (the sixth statement is a plain correct statement in the full version) and scoring of statements removed silently from drafts.

## Needs human review before use

All scenario content was generated quickly and is marked `needs_review: true` in `data/scenario.json`. Please check:

1. **Every figure marked correct agrees with the source pack**: 48 of 120; 27 of 48 = 56%; 19 of 27 = 70%; 41 of 48 = 85%; quiz means 27.5 and 24.5.
2. **The three planted errors are wrong in the way the reveal says**: 65% against 56%; Marlowe & Quist (2031) absent from the reading list; "proves" against the method note.
3. **The invented reference** matches no real author, study or journal.
4. **The four classmate names** are fictional and match no real student.
5. **Stand-by replies** (`reask_text`): each should defend its statement without adding any new figure.
6. **Marker patterns** (`error_markers`, `fixed_markers`, `keep_markers`, `ask_markers`, `basis_markers`, `accept_markers`, and the data-point patterns in `scoring.ts`): try several natural rewordings of each statement and confirm they are detected.
7. **Reveal and advice wording** for tone, including the `advice` and `reveal` dictionaries.
8. **Thresholds and timings**: `thresholds`, `budget`, `time_limit_s` and `ghostwrite_offer.delay_s`. Also the pre-written paragraph in `ghostwrite_offer.paragraph`.
9. **The live model's system prompt** in `src/lib/llm.ts`: try asking it to verify each figure and confirm it sends the student to the source pack.

## Contributing

Use GitHub Issues for tasks and bugs. Keep `main` stable and open a pull request from a short-lived branch for each change.

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
# Make and check your changes, then stage the intended files.
git add path/to/changed-file
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Open a pull request into `main`, link the relevant issue, and include how you tested the change. Ask a teammate to review before merging.

Keep credentials, real student submissions and conversation logs out of this public repository. `data/scenario.json` holds the scenario's answer key; it is entirely synthetic and is published so the prototype can be run.
