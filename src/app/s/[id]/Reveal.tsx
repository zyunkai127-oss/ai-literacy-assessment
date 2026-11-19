'use client';
import { useEffect, useState } from 'react';
import type { Reveal } from './shared';

const HEADLINE: Record<Reveal['headline']['kind'], string> = {
  E1: 'The moment you were confident, and wrong',
  E2: 'Something to look at',
  E3: 'Something to look at',
  best_call: 'Your best call',
  none: 'Nothing stood out this time',
};
const BAND_CLASS: Record<string, string> = { Emerging: 's0', Developing: 's1', Proficient: 's2' };
const DIRECT: [keyof Reveal['direct']['features'], string][] = [['topic', 'Topic'], ['length', 'Length'], ['sources', 'Sources'], ['audience', 'Audience']];
const RATING = ['no reason given', 'general', 'specific'];
const NOT_ENOUGH = 'Not enough evidence in this session';

const FACTOR_COPY: Record<string, { supported?: string; practise?: string; insufficient: string }> = {
  direction: {
    supported: 'You asked the assistant for help with the task.',
    insufficient: 'It’s unclear what help you asked for.',
  },
  basis: {
    supported: 'You checked a claim and cited the sources for your figures.',
    practise: 'You used an AI answer. We saw no source check in this session.',
    insufficient: 'We couldn’t confirm how you checked your figures.',
  },
  selection: {
    supported: 'You explained a choice you made in your brief.',
    insufficient: 'Say what you kept, changed or skipped and why.',
  },
  uncertainty: {
    supported: 'You explained why the quiz scores alone can’t show AI’s effect.',
    practise: 'You said AI caused the difference in marks. The quiz only compared two groups.',
    insufficient: 'It’s unclear what limits you see in the data.',
  },
  ownership: {
    practise: 'Some wording matches the AI reply. Check your declaration.',
    insufficient: 'You reported who wrote the brief.',
  },
  review: {
    supported: 'You explained what you did with the feedback.',
    insufficient: 'We couldn’t confirm how you used the feedback.',
  },
};

const Mark = ({ ok }: { ok: boolean | null }) => (
  <span className={`mark ${ok === null ? 'na' : ok ? 'yes' : 'no'}`} aria-label={ok === null ? 'not observed' : ok ? 'yes' : 'no'}>{ok === null ? '–' : ok ? '✓' : '✗'}</span>
);

export function RevealPage({ api }: { api: string }) {
  const [data, setData] = useState<Reveal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${api}/result`).then(async (res) => {
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    }).catch(() => setError('Unable to load your results. Refresh to try again.'));
  }, [api]);
  if (error) return <main className="wrap"><p role="alert" className="error">{error}</p></main>;
  if (!data) return <main className="wrap"><p className="muted">Loading results</p></main>;

  if (data.collaboration) {
    const briefChecks = [data.quality.validPoints >= 2, data.quality.sourced, data.quality.hasView, data.quality.wordsOK, data.quality.onTime];
    const checksMet = briefChecks.filter(Boolean).length;
    const factors = [...data.collaboration].sort((a, b) => Number(b.status === 'practise') - Number(a.status === 'practise'));
    const causalConcern = factors.some(c => c.id === 'uncertainty' && c.status === 'practise');
    const sourceConcern = factors.some(c => c.id === 'basis' && c.status === 'practise');
    const focus = causalConcern ? 'The quiz gap cannot establish cause.' : sourceConcern ? 'Check the source before using an AI answer.' : 'How you worked with the assistant';
    return (
    <main className="wrap session-report">
      <header className="report-overview">
        <div className="report-dial" aria-label={checksMet + ' of 5 brief checks met'}>
          <div className="dial-track" aria-hidden="true" style={{background: `conic-gradient(from 270deg at 50% 100%, ${briefChecks.map((ok, i) => `${ok ? 'var(--accent)' : 'var(--line)'} ${i * 36}deg ${(i + 1) * 36 - 2}deg, white 0 ${(i + 1) * 36}deg`).join(', ')}, transparent 0)`}} />
          <strong>{checksMet}<small> / 5</small></strong><span>Brief checks met</span>
        </div>
        <div><p className="report-kicker">Session feedback</p><h1>{focus}</h1>
          <p className="muted">{causalConcern ? 'Your brief attributes the difference in marks to AI. Students chose whether to use AI, and seminar attendance also differed.' : sourceConcern ? 'You used an AI answer in your brief. We saw no source check in this session.' : 'Explore the decisions and evidence from your briefing activity.'}</p>
        </div>
      </header>
      {data.assessment?.status === 'unavailable' && <p role="status" className="notice">AI-assisted feedback is temporarily unavailable. Task-completion checks are shown below.</p>}
      <section className="report-factors"><h2>{data.followUp ? 'Common core factors' : 'Collaboration factors'}</h2>
      {factors.map((check) => {
        const recorded = check.id === 'ownership' && check.status === 'insufficient' && data.assessment?.status === 'complete';
        const unavailable = data.assessment?.status === 'unavailable';
        const copy = FACTOR_COPY[check.id];
        let label = 'Fair';
        if (recorded) label = 'Recorded';
        else if (unavailable) label = 'Feedback unavailable';
        else if (check.status === 'supported') label = 'Great';
        else if (check.status === 'practise') label = 'Need Work';

        const subtitle = unavailable ? 'We couldn’t assess this part of the session.'
          : copy?.[check.status] ?? check.evidence;
        const references = check.evidence.match(/Evidence messages: .+$/)?.[0];
        const partialEvidence = check.status === 'insufficient' && !recorded && !unavailable
          && check.evidence !== 'The session did not provide enough clear evidence for this dimension.';
        return (
          <details className="report-factor" key={check.id}>
            <summary>
              <span>{check.title}{subtitle && <small className="factor-subtitle">{subtitle}</small>}</span>
              <span className={`factor-status ${recorded || unavailable ? 'neutral' : check.status}`}>{label}</span>
            </summary>
            <div className="factor-detail">{references && <p>{references}</p>}{partialEvidence && <p>{check.evidence}</p>}
              <h3>How this is judged</h3><p>{check.criterion}</p>
              {!recorded && check.status !== 'supported' && <><h3>Next time</h3><p>{check.next}</p></>}
            </div>
          </details>
        );
      })}
      </section>
      {data.claims.length > 0 && (
        <section className="card">
          <h2>The assistant’s evidence summary: statement by statement</h2>
          <p className="muted small">This part is the same for every student and is judged by fixed rules, not by AI. Some statements in the summary were wrong on purpose. Opening a source on its own is not counted, and nor is silently leaving a statement out.</p>
          {data.headline.kind === 'E1' && (
            <div className="card headline E1">
              <h3>The moment you were confident, and wrong</h3>
              <p>{data.headline.happened}</p>
              <p><b>What it shows.</b> {data.headline.means}</p>
              <p><b>What to do next.</b> {data.headline.next}</p>
            </div>
          )}
          {data.decide.status === 'ok' && (
            <details>
              <summary>Acting on your doubts: <span className={`pill ${BAND_CLASS[data.decide.band!]}`}>{data.decide.band}</span>{data.decide.wide ? ' (few moments, so a rough read)' : ''}{data.decide.capped ? ' (limited by the confident error)' : ''}</summary>
              <div className="body">{data.decide.items.map((item, i) => <p key={i} className="small"><Mark ok={item.outcome === 'success'} /> {item.evidence}</p>)}</div>
            </details>
          )}
          {data.discern.status === 'ok' ? (
            <>
              <p><span className="pill s1 type">{data.discern.label}</span> {data.discern.meaning}</p>
              <p className="muted small">You rejected or corrected {data.discern.hits} of {data.discern.hits + data.discern.misses} wrong statements and rejected {data.discern.fas} of {data.discern.fas + data.discern.crs} correct ones. Statements you neither used nor commented on are not counted.</p>
            </>
          ) : <p className="muted small"><b>{NOT_ENOUGH}</b> for an overall pattern: that needs at least two wrong statements and one correct statement that you used, corrected or rejected.</p>}
          {data.claims.map((claim) => (
            <details key={claim.id} open={claim.sdt === 'MISS' || undefined}>
              <summary>
                {claim.title}{' '}
                <span className={`pill ${claim.flawed ? 's0' : 's2'}`}>{claim.flawed ? 'Wrong' : 'Correct'}</span>{' '}
                <span className="muted small">{claim.sdt === 'HIT' ? (claim.ladder === 2 ? 'caught and acted on' : 'doubted, but still in your brief') : claim.sdt === 'MISS' ? 'got past you' : claim.sdt === 'FA' ? 'false alarm' : claim.sdt === 'CR' ? 'rightly used' : 'not counted'}</span>
              </summary>
              <div className="body">
                <p><b>The assistant said</b><br />{claim.text}</p>
                <p><b>What you did</b><br />{claim.evidence}</p>
                <p><b>What was true</b><br />{claim.reveal}</p>
              </div>
            </details>
          ))}
          <p className="muted small">{data.notice} The wrong statements were planted on purpose and are corrected above.</p>
        </section>
      )}
      <section className="card">
        <h2>The brief itself</h2>
        <p><Mark ok={data.quality.validPoints >= 2} /> At least 2 recognised data points ({data.quality.validPoints} found)</p>
        <p><Mark ok={data.quality.sourced} /> Each recognised data point names its source</p>
        <p><Mark ok={data.quality.hasView} /> A student view from the survey comments</p>
        <p><Mark ok={data.quality.wordsOK} /> 80–150 words ({data.quality.words})</p>
        <p><Mark ok={data.quality.onTime} /> Submitted on time</p>
        <p className="muted small">These are task-completion checks, not a measure of AI literacy or a full fact-check.</p>
      </section>
      {data.followUp && <section className="card">
        <h2>Adaptive follow-up</h2>
        <p className="muted">These observations are separate from the common core task. Different questions and support levels are not directly comparable.</p>
        {data.followUp.status === 'unavailable' && <p role="status">Some follow-up feedback is unavailable.</p>}
        {data.followUp.turns.map(turn => <div className="decision" key={turn.id}>
          <p><b>Question {turn.id} · {turn.target === 'basis' ? 'Tracing evidence' : turn.target === 'uncertainty' ? 'Calibrating conclusions' : 'Explaining choices'}</b></p>
          <p>{turn.support === 'none' ? 'No content hint' : turn.support === 'general' ? 'General hint' : 'Specific help'} · {turn.outcome === 'met' ? 'Criterion demonstrated' : turn.outcome === 'not_met' ? 'Criterion not yet demonstrated' : 'Not enough clear evidence'}</p>
          <p className="muted small">Evidence: follow-up answer {turn.id}. {turn.reviewed === 'human' ? 'Reviewed by a teacher.' : turn.reviewed === 'automatic' ? 'Cross-checked by the verifier.' : 'No verified judgement.'}</p>
        </div>)}
        <details><summary>System activity</summary><p className="small">{data.followUp.calls} model calls · {(data.followUp.latencyMs / 1000).toFixed(1)} seconds in model calls · {data.followUp.inputTokens} input tokens · {data.followUp.outputTokens} output tokens</p></details>
      </section>}
      <a href="/">Start a new session</a>
    </main>
  );

  }

  const { headline, discern, decide, own, direct, quality } = data;
  const wrongSeen = discern.hits + discern.misses;
  const rightSeen = discern.fas + discern.crs;

  return (
    <main className="wrap">
      <h1>How you worked with the assistant</h1>
      <p className="muted">Based on your choices in this session only. It describes what you did here, not what kind of person you are. There is no overall score and no ranking.</p>

      <section className={`card headline ${headline.kind}`}>
        <h2>{HEADLINE[headline.kind]}</h2>
        <h3>What happened</h3>
        <p>{headline.happened}</p>
        <h3>What it shows</h3>
        <p>{headline.means}</p>
        <h3>What to do next</h3>
        <p>{headline.next}</p>
      </section>

      <section className="card">
        <h2>Your profile in this session</h2>
        <div className="dims">
          <div className="dim">
            <h3>Discern <span className="muted small">telling right from wrong</span></h3>
            {discern.status === 'ok' ? (
              <>
                <p><span className="pill s1 type">{discern.label}</span></p>
                <p>{discern.meaning}</p>
                <p className="muted small">You questioned, rejected or corrected {discern.hits} of {wrongSeen} wrong statements and rejected {discern.fas} of {rightSeen} correct ones. Statements you neither used nor commented on are not counted.</p>
              </>
            ) : (
              <>
                <p><b>{NOT_ENOUGH}</b></p>
                <p className="muted small">A type needs at least two wrong statements and one correct statement that you used, questioned or rejected.</p>
              </>
            )}
          </div>

          <div className="dim">
            <h3>Decide <span className="muted small">acting on your doubts</span></h3>
            {decide.status === 'ok' ? (
              <>
                <p><span className={`pill ${BAND_CLASS[decide.band!]}`}>{decide.band}</span></p>
                {decide.wide && <p className="muted small">Few moments, so this is a rough read.</p>}
                {decide.capped && <p className="muted small">Limited by the confident error above.</p>}
              </>
            ) : (
              <>
                <p><b>{NOT_ENOUGH}</b></p>
                <p className="muted small">A band needs at least two moments where you had to act on a doubt.</p>
              </>
            )}
            {decide.items.length > 0 && (
              <details>
                <summary className="small">The {decide.items.length} moment{decide.items.length === 1 ? '' : 's'} behind this</summary>
                <div className="body">
                  {decide.items.map((item, i) => <p key={i} className="small"><Mark ok={item.outcome === 'success'} /> {item.evidence}</p>)}
                </div>
              </details>
            )}
          </div>

          <div className="dim">
            <h3>Own <span className="muted small">keeping the work yours</span></h3>
            {own.checks.map((check) => (
              <p key={check.id} className="small"><Mark ok={check.ok} /> <b>{check.title}</b>{check.ok === null ? ' (not observed)' : ''}<br /><span className="muted">{check.evidence}</span></p>
            ))}
            {own.viva && <p className="small"><b>Your explanation:</b> {RATING[own.viva.rating]}<br /><span className="muted">Follow-up question: {own.viva.question}</span><br /><span className="muted">{own.viva.rating === 2
              ? 'Your answer names a detail or source relevant to this statement. This describes the specificity of your reason; accuracy is reviewed above.'
              : own.viva.rating === 1
                ? own.viva.kind === 'generic'
                  ? 'Your answer gives a reason. This broad follow-up is reported as general because it is not tied to a particular statement.'
                  : 'Your answer gives a reason, but no statement-specific detail or source was recognised. Naming the figure, document or method you relied on can make the basis clearer.'
                : 'No reason was recognised. Explain what you based your decision on in a sentence, referring to a detail or source where possible.'}</span></p>}
          </div>

          <div className="dim">
            <h3>Direct <span className="muted small">your first instruction</span></h3>
            {direct.instruction === null ? <p className="muted small">You did not give the assistant a task instruction.</p> : (
              <>
                <p>{DIRECT.map(([key, label]) => <span key={key} className={`chip ${direct.features[key] ? 'on' : ''}`}>{direct.features[key] ? '✓' : '·'} {label}</span>)}</p>
                {direct.instruction && <p className="muted small">“{direct.instruction}”</p>}
              </>
            )}
            <p className="muted small">Not graded in this version.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Statement by statement</h2>
        {data.claims.length === 0 && <p className="muted small">The assistant’s research summary did not come up in this session, so there are no statements to review.</p>}
        {data.claims.map((claim) => {
          const peers = data.cohort.find((c) => c.claimId === claim.id);
          return (
            <details key={claim.id} open={(headline.kind === 'E1' && headline.claimId === claim.id) || undefined}>
              <summary>
                {claim.title}{' '}
                <span className={`pill ${claim.flawed ? 's0' : 's2'}`}>{claim.flawed ? 'Wrong' : 'Correct'}</span>{' '}
                <span className="muted small">{claim.sdt === 'HIT' ? (claim.ladder === 2 ? 'caught and acted on' : 'doubted, but still in your brief') : claim.sdt === 'MISS' ? 'got past you' : claim.sdt === 'FA' ? 'false alarm' : claim.sdt === 'CR' ? 'rightly used' : 'not counted'}</span>
              </summary>
              <div className="body">
                <p><b>The assistant said</b><br />{claim.text}</p>
                <p><b>How this is judged</b><br />{claim.criterion}</p>
                <p><b>What you did</b><br />{claim.evidence}</p>
                <p><b>What was true</b><br />{claim.reveal}</p>
                {peers && <p className="muted small">{peers.shipped} of {peers.n} stored sessions today handed in this statement.</p>}
              </div>
            </details>
          );
        })}
      </section>

      <section className="card">
        <h2>What to try next</h2>
        <ul>{data.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
      </section>

      <section className="card">
        <h2>The brief itself</h2>
        <p className="muted small">Reported separately. It is not part of the profile above.</p>
        <p className="small"><Mark ok={quality.validPoints >= 2} /> At least 2 data points from the source pack ({quality.validPoints} found)</p>
        <p className="small"><Mark ok={quality.sourced} /> Each data point names its source in the same sentence ({quality.attributed} of {quality.validPoints})</p>
        <p className="small"><Mark ok={quality.hasView} /> One student view from the survey comments</p>
        <p className="small"><Mark ok={quality.wordsOK} /> 80 to 150 words ({quality.words})</p>
        <p className="small"><Mark ok={quality.onTime} /> Submitted on time</p>
        <p className="small"><b>{quality.met ? 'The brief meets the task requirements.' : 'The brief does not yet meet all the task requirements.'}</b></p>
      </section>

      <section className="card">
        <h2>Every statement the assistant made</h2>
        {data.statements.map((statement) => (
          <p key={statement.id} className="small"><span className={`pill ${statement.wrong ? 's0' : 's2'}`}>{statement.wrong ? 'Wrong' : 'Correct'}</span> {statement.text}</p>
        ))}
        {data.statements.length === 0 && <p className="muted small">None were shown in this session.</p>}
        <p className="muted small">{data.notice} The wrong statements were planted on purpose and are corrected above.</p>
      </section>
      <a href="/">Start a new session</a>
    </main>
  );
}
