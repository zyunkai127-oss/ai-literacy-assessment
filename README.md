# AI Literacy Check

A prototype for the Reply Student Tech Clash "AI on Campus" challenge (Track A, full-stack engineering).

## The problem

Students use AI for coursework, but assessment looks only at the finished piece. It cannot tell a student who checked what the AI said from one who accepted everything. Students get no feedback on how they work with AI.

## What this does

A student completes one small, timed piece of work with an AI research assistant: a briefing paragraph for a supervisor, written from a fictional source pack. Normal messages go to the live assistant. The app observes chat and student work in the background. Phase 1 runs without scripted interventions.

Students work in AI Chat and the Brief editor with optional access to the source pack. Submitting the brief opens the results directly. The results show an overall percentage, the four competency percentages where supported, points with evidence and personalised feedback. Older sessions can still show corrections to any controlled statements they received.

| Competency | Evidence the rubric uses |
|---|---|
| Effective | Specificity of the first task instruction and whether the submitted brief meets the task requirements |
| Critical | Controlled-claim evidence from older sessions. New Phase 1 sessions show Insufficient Evidence for this criterion. |
| Independent | Wording overlap with assistant replies, requests for a finished brief, and recorded responses to teammate messages in older sessions |
| Responsible | Handling of classmate names and attribution for recognised data points |

An item earns 0–2 points when there is scorable evidence. Each percentage is earned points divided by available points, rounded to a whole percentage. Items with insufficient evidence count toward neither total. A source open records access and does not by itself establish whether a claim was verified. A competency with no scorable items shows **Insufficient Evidence**.

## Run it

Requires Node 22.13 or later (it uses Node's built-in SQLite).

```bash
npm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # chat context, scoring, guardrails and session state
```

Add a valid Anthropic API key to `.env.local` and restart the dev server to enable live chat. The default Claude API model is `claude-haiku-5-5`. With no credentials, the chat is unavailable and students can continue using the source pack and editor.

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
src/lib/llm.ts            streamed model replies and service errors
src/lib/scenario.ts       server-only loader; strips the answer key for the browser
src/app/api/...           route handlers
src/app/...               pages
```

**Session state** lives on the server: `consent → intro → work → reveal`. Requests made in the wrong state get a 409. A previous submission awaiting debrief can open results through the submit endpoint, and completed legacy sessions retain their original points.

**Setting and marking are separate.** The answer key exists only in `data/scenario.json` and is read only by server code. The assistant's system prompt contains no information about which statements are wrong. No endpoint returns markers, flags or reveal text until the session reaches `reveal`.

**Chat and observation are separate.** The model gets the project brief, anonymised source documents and conversation history. New sessions do not create controlled claim or teammate exposures. Unshown claims are excluded from scoring. Older sessions retain their recorded evidence.

**Event log.** Every consent, message, source opened, draft snapshot, guardrail trigger, submission and score is stored with a timestamp.

### API

| Method and path | Purpose |
|---|---|
| `POST /api/sessions` | Create a session after consent. Body: `{mode, understood, store}` |
| `GET /api/sessions/:id` | Session as the browser may see it |
| `POST /api/sessions/:id/start` | Start the clock |
| `POST /api/sessions/:id/chat` | Send a message. Responds with a server-sent event stream |
| `POST /api/sessions/:id/event` | Record a source being opened or a draft snapshot |
| `POST /api/sessions/:id/submit` | Submit the brief, score it and unlock results |
| `GET /api/sessions/:id/result` | The reveal |
| `GET /api/ops` | Operational figures |

### Privacy and observation

Classmate names, email addresses and phone numbers are redacted from chat before storage and transmission. The model receives the anonymised source pack. Potential requests for internal instructions or finished work are logged as signals. They do not change how the assistant answers.

## Ethics

- Before starting, the student is told "The AI in this activity may sometimes be wrong" and must confirm they understand.
- Storing the session is a separate, optional choice. Without it, the student's messages, brief and free-text snapshots are deleted from app storage when they finish. Derived scoring evidence remains available to them and they are left out of the group comparison.
- Any controlled error that appeared in an older session is revealed at the end, with the correct information.
- Planted errors are confined to a fictional module. The invented reference carries a publication year in the future and names no real person or journal.
- Feedback is addressed to the student and describes this session only.

## APIs used

- Anthropic Messages API (streaming), model `claude-haiku-5-5`, through `@anthropic-ai/sdk`. Used for normal chat. Redacted messages and source-pack excerpts are sent to the provider.

No other external services.

## Known limitations

- **The rubric is uncalibrated.** Percentages describe observed criteria in this task. Two sessions can have different available points.
- **Only in-app activity is visible.** Opening a source shows access. Reading elsewhere and edits between autosave snapshots may leave no trace.
- **Matching is rule-based.** Data, citation, student-view and decision patterns can miss natural rewordings or misread ambiguous wording. Attribution looks for the source in the same sentence or clause as the data.
- **The timer includes five seconds of submission tolerance.** Students can still submit after the timer reaches zero. The completion criterion accounts for overtime.
- **Group comparison is limited.** It covers consenting sessions shown the same controlled claim in the last 24 hours and appears only when at least five qualify.
- **Live model accuracy varies.** The rubric does not treat an unplanned model error as a controlled assessment opportunity.

## Needs human review before use

All scenario content was generated quickly and is marked `needs_review: true` in `data/scenario.json`. Please check:

1. **Every figure marked correct agrees with the source pack**: 48 of 120; 27 of 48 = 56%; 19 of 27 = 70%; 41 of 48 = 85%; quiz means 27.5 and 24.5.
2. **The three planted errors are wrong in the way the reveal says**: 65% against 56%; Marlowe & Quist (2031) absent from the reading list; "proves" against the method note.
3. **The invented reference** matches no real author, study or journal.
4. **The four classmate names** are fictional and match no real student.
5. **Historical quick-version claims** (`judge_path: true`): verify the reveal and grading for recorded exposures. Unobserved criteria remain unscored.
6. **Marker patterns** (`error_markers`, `keep_markers`, and the data-point patterns in `scoring.ts`): try several natural rewordings of each statement and confirm they are detected.
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
