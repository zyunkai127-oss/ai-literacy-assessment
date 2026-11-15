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

  if (data.collaboration) return (
    <main className="wrap">
      <h1>How you worked with the assistant</h1>
      <p className="muted">AI-assisted feedback on this session, with no overall score or ranking. Missing evidence does not mean missing ability.</p>
      {data.assessment?.status === 'unavailable' && <p role="status" className="notice">AI-assisted feedback is temporarily unavailable. Task-completion checks are shown below.</p>}
      {data.collaboration.map((check) => (
        <section className="card" key={check.id}>
          <h2>{check.title}</h2>
          <p><span className={`pill ${check.status === 'supported' ? 's2' : check.status === 'practise' ? 's1' : ''}`}>{check.status === 'supported' ? 'Evidence observed' : check.status === 'practise' ? 'Worth reflecting on' : 'Not enough evidence'}</span></p>
          <p>{check.evidence}</p>
          <details><summary>How this is judged</summary><p className="body">{check.criterion}</p></details>
          {check.status !== 'supported' && <p className="muted">{check.next}</p>}
        </section>
      ))}
      <section className="card">
        <h2>The brief itself</h2>
        <p><Mark ok={data.quality.validPoints >= 2} /> At least 2 recognised data points ({data.quality.validPoints} found)</p>
        <p><Mark ok={data.quality.sourced} /> Each recognised data point names its source</p>
        <p><Mark ok={data.quality.hasView} /> A student view from the survey comments</p>
        <p><Mark ok={data.quality.wordsOK} /> 80–150 words ({data.quality.words})</p>
        <p><Mark ok={data.quality.onTime} /> Submitted on time</p>
        <p className="muted small">These are task-completion checks, not a measure of AI literacy or a full fact-check.</p>
      </section>
      <a href="/">Start a new session</a>
    </main>
  );

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
