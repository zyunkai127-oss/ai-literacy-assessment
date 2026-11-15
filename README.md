# AI Literacy Check

A prototype for the Reply Student Tech Clash "AI on Campus" challenge (Track A, full-stack engineering).

## The problem

Students use AI for coursework, but assessment looks only at the finished piece. It cannot tell a student who checked what the AI said from one who accepted everything. Students get no feedback on how they work with AI.

## What this does

A student completes one small, timed piece of work with an AI research assistant: a briefing paragraph for a supervisor, written from a fictional source pack. The assistant's first draft contains pre-written statements, some of them wrong. The student is told the AI may be wrong, but not where.

The system does not ask quiz questions. It records what the student does (what they ask, which sources they open, what ends up in the brief) and scores a small set of moments where good and poor use of AI leave different traces. At the end, every planted error is revealed and the student gets feedback that quotes their own session.

There is no overall score and no ranking.

| Moment | What is planted | What is recorded | Area |
|---|---|---|---|
| First instruction | The assistant waits for the student | Whether the message names topic, length or audience, and sources | Effective |
| Altered number | Draft says 65%, source says 56% | Source opened; which figure is in the brief | Critical |
| Invented reference | A study that is not on the reading list | Reading list opened; reference kept or dropped | Critical |
| Correlation as causation | "proves that using AI improves learning" | Causal wording in the brief | Critical |
| Surprising but correct | A true figure that looks too high | Whether it was rejected | Critical |
| Teammate pressure (full version) | A teammate says a correct figure is wrong | Checked the source, or just dropped it | Independent |
| Own wording | The AI draft is right there, the clock is running | Word-for-word overlap; requests to write the brief | Independent |
| Classmates' names | Raw survey comments include names | Names sent to the assistant or left in the brief | Responsible |
| Naming sources | The request asks where data comes from | Source named in the brief | Responsible |
| Meeting the request | 2 data points, 1 student view, on time | Counted from the brief | Effective |

Each moment scores 0, 1 or 2. An area's result is the share of points earned: below 0.5 Emerging, 0.5 to 0.79 Developing, 0.8 and above Proficient. Sharing a classmate's name caps Responsible at Developing.

## Run it

Requires Node 22.13 or later (it uses Node's built-in SQLite).

```bash
npm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # unit tests for scoring, guardrails and the state machine
```

Without an API key the app still runs: free-form follow-up questions get a pre-written reply and the chat panel is labelled "offline replies".

- `/` consent and choice of version (quick: 3 minutes, full: 8 minutes)
- `/s/:id` the session
- `/ops` guardrail triggers, response latency and session counts

Delete `data/app.db` to clear all sessions.

## How it is built

Next.js (App Router), TypeScript, SQLite, Anthropic API.

```
data/scenario.json        the whole scenario and its answer key, in one file
src/lib/scoring.ts        pure scoring functions
src/lib/guardrails.ts     pure guardrail checks
src/lib/machine.ts        session state machine
src/lib/store.ts          SQLite: sessions and the event log
src/lib/llm.ts            streamed model replies, with fallback
src/lib/scenario.ts       server-only loader; strips the answer key for the browser
src/app/api/...           route handlers
src/app/...               pages
```

**Session state** lives on the server: `consent → intro → work → debrief → reveal`. Any request made in the wrong state gets a 409.

**Setting and marking are separate.** The answer key exists only in `data/scenario.json` and is read only by server code. The assistant's system prompt contains no information about which statements are wrong. No endpoint returns markers, flags or reveal text until the session reaches `reveal`.

**Pre-written statements are never rewritten by a model.** The first draft, and the assistant's reply when a student questions one of its statements, are returned verbatim, so a model cannot quietly correct a planted error. Only open follow-up questions go to the live model.

**Event log.** Every consent, message, source opened, draft snapshot, guardrail trigger, submission and debrief answer is stored with a timestamp.

### API

| Method and path | Purpose |
|---|---|
| `POST /api/sessions` | Create a session after consent. Body: `{mode, understood, store}` |
| `GET /api/sessions/:id` | Session as the browser may see it |
| `POST /api/sessions/:id/start` | Start the clock |
| `POST /api/sessions/:id/chat` | Send a message. Responds with a server-sent event stream |
| `POST /api/sessions/:id/event` | Record a source being opened or a draft snapshot |
| `POST /api/sessions/:id/teammate` | Deliver the scripted teammate message (full version) |
| `POST /api/sessions/:id/submit` | Submit the brief |
| `POST /api/sessions/:id/debrief` | Submit the three debrief answers; scoring runs here |
| `GET /api/sessions/:id/result` | The reveal |
| `GET /api/ops` | Operational figures |

### Guardrails (in code, before any model call)

1. **Personal data.** Classmate names from the source pack, email addresses and phone numbers are replaced before the message is stored or sent to the model.
2. **Extraction attempts.** Messages that try to get the system prompt, the answer key or the scoring rules receive a fixed refusal and never reach the model.
3. **Guide-only mode.** When a student asks the assistant to write the finished brief, the assistant's rules change for the rest of the session: it asks guiding questions and suggests a structure instead.

The assistant's rules also change when under a minute is left (shorter replies). The model is told not to introduce any statistic or reference beyond its draft. Every trigger is written to the event log, and two of the three also count as evidence in the results.

## Ethics

- Before starting, the student is told "The AI in this activity may sometimes be wrong" and must confirm they understand.
- Storing the session is a separate, optional choice. Without it, the student's messages and brief are deleted when they finish and they are left out of the group comparison.
- Every planted error is revealed at the end, with the correct information.
- Planted errors are confined to a fictional module. The invented reference carries a publication year in the future and names no real person or journal.
- Feedback is addressed to the student and describes this session only.

## APIs used

- Anthropic Messages API (streaming), model `claude-haiku-5-5`, through `@anthropic-ai/sdk`. Used only for open follow-up questions.

No other external services.

## Known limitations

- **Thresholds are not calibrated.** The three bands are placeholders.
- **Few moments per area.** Independent rests on one or two moments, Effective on two. A session with little activity scores 1 on most moments and lands on Developing by default.
- **It measures what a student can do when alert**, not what they do under normal conditions. They know the AI may be wrong.
- **Only in-app behaviour is visible.** Reading a source without opening its section, or checking elsewhere, is not recorded.
- **Marker matching is simple.** The brief is checked with patterns. Unusual rewording can be missed, and the check for causal language only recognises common phrasings.
- **Follow-up conversation is not scored**, apart from the guardrail triggers.
- **Small group comparison.** It is hidden below 5 stored sessions and covers the last 24 hours only.
- **The live model can drift from the script.** It is told not to comment on its own draft, but a model may still hint at a problem if a student asks an open question.
- Not verified: the teammate message was checked through the API but not watched arriving in the browser, and the full 8-minute version has not been walked through end to end in a browser.

## Needs human review before use

All scenario content was generated quickly and is marked `needs_review: true` in `data/scenario.json`. Please check:

1. **Every figure marked correct agrees with the source pack**: 48 of 120; 27 of 48 = 56%; 19 of 27 = 70%; 41 of 48 = 85%; quiz means 27.5 and 24.5.
2. **The three planted errors are wrong in the way the reveal says**: 65% against 56%; Marlowe & Quist (2031) absent from the reading list; "proves" against the method note.
3. **The invented reference** matches no real author, study or journal.
4. **The four classmate names** are fictional and match no real student.
5. **The quick-version path** (`judge_path: true`): statements c2, c3, c4, c5 and all five non-statement moments. This is what judges will see.
6. **Marker patterns** (`error_markers`, `fixed_markers`, `keep_markers`): try several natural rewordings of each statement and confirm they are detected.
7. **Reveal and advice wording** for tone.

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
