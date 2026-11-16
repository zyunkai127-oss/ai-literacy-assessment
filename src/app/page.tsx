'use client';
import { useState } from 'react';
import { Arrow, Brand, Spark } from './ui';

export default function Consent() {
  const [understood, setUnderstood] = useState(false);
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState<'judge' | 'full' | null>(null);
  const [error, setError] = useState('');

  async function begin(mode: 'judge' | 'full') {
    setBusy(mode);
    setError('');
    try {
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, understood, store }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to start your session. Please try again.');
      window.location.href = `/s/${body.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start your session. Please try again.');
      setBusy(null);
    }
  }

  return (
    <main className="landing" id="top">
      <section className="hero" aria-labelledby="hero-title">
        <header className="site-header">
          <Brand />
          <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#before-you-start">Before you start</a></nav>
          <a className="button header-cta" href="#before-you-start">Let’s begin <Arrow /></a>
        </header>
        <div className="hero-main">
          <p className="eyebrow"><span className="status-dot" /> Human thinking. AI assistance.</p>
          <h1 id="hero-title">A little AI.<br />A lot of <span className="hero-you">you<svg viewBox="0 0 300 28" aria-hidden="true"><path d="M5 17Q130 0 290 11M30 25Q150 11 270 19" /></svg></span>.</h1>
          <div className="thinking-orb" aria-hidden="true"><div className="orb-eyes"><i /><i /></div><span className="orb-spark"><Spark /></span></div>
          <p className="hero-description">AI can give you an answer.<br />What you do with it is what matters.</p>
          <a className="button hero-cta" href="#before-you-start">Find your way with AI <Arrow /></a>
        </div>
        <div className="hero-bottom"><span>AI LITERACY CHECK<br /><span className="hero-caption">A short activity. A fresh perspective.</span></span><a href="#how-it-works">Curiosity looks good on you <Arrow direction="down" /></a></div>
      </section>
      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading"><p className="eyebrow">A small challenge for your big brain</p><h2 id="how-title">Less guessing.<br />More thinking.</h2><p>Work with an AI research assistant to write a short briefing for a supervisor. You bring the judgement.</p></div>
        <div className="steps">
          <article><span className="step-number">01 /</span><h3>Get curious.</h3><p>Explore a small pack of fictional sources. Ask the assistant for help, a summary or a different perspective.</p></article>
          <article><span className="step-number">02 /</span><h3>Make the call.</h3><p>Decide what to trust, what to check and what to leave out. Write an 80–150 word brief in your own words.</p></article>
          <article><span className="step-number">03 /</span><h3>See your thinking.</h3><p>Reflect on your choices and get feedback with evidence from your own session. No overall score. No ranking.</p></article>
        </div>
      </section>
      <section className="start-section" id="before-you-start" aria-labelledby="start-title">
        <div className="start-intro"><p className="eyebrow">Before you jump in</p><h2 id="start-title">Your call.<br />Your words.</h2><p>The AI in this activity may sometimes be wrong. How far to rely on it is up to you.</p><p>This is not a hunt for mistakes. Do the task the way you would do real coursework.</p><div className="start-note"><Spark /><span>No account.<br />Just an open mind.</span></div></div>
        <div className="consent-panel" aria-busy={busy !== null}>
          <p className="eyebrow">Make yourself comfortable</p><h3>A quick heads-up.</h3>
          <p>All data, names and references in the activity are fictional. Your feedback draws on your chat, source opens, editor snapshots, submitted brief and follow-up answers.</p>
          <details className="privacy-details"><summary>What happens to my data?</summary><div className="body"><p>Your chat, brief and follow-up answers are sent to the AI provider with names and contact details removed. The full version adapts up to two follow-up questions and may pause for teacher review.</p><p>No name or account is collected. Unless you choose anonymous storage below, your messages and brief are deleted from this app when you finish.</p><p>There is no overall score and no ranking. Where the session does not give enough evidence, the feedback says so.</p></div></details>
          <label className="check"><input type="checkbox" checked={understood} disabled={busy !== null} onChange={(e) => setUnderstood(e.target.checked)} /><span>I understand that the AI in this activity may sometimes be wrong. <span className="required-label">Required</span></span></label>
          <label className="check"><input type="checkbox" checked={store} disabled={busy !== null} onChange={(e) => setStore(e.target.checked)} /><span>Store my session anonymously to help review this prototype. <span className="optional-label">Optional</span></span></label>
          <p className="consent-hint" id="start-hint">{understood ? 'You’re ready. Choose the time that works for you.' : 'Tick the required box to choose your activity.'}</p>
          <div className="version-actions">
            <button className="primary version-button" aria-describedby="start-hint" disabled={!understood || busy !== null} onClick={() => begin('judge')}><span><b>{busy === 'judge' ? 'Starting…' : 'Quick version'}</b><small>4 minutes · the essentials</small></span><Arrow /></button>
            <button className="version-button" aria-describedby="start-hint" disabled={!understood || busy !== null} onClick={() => begin('full')}><span><b>{busy === 'full' ? 'Starting…' : 'Full version'}</b><small>8 minutes · plus follow-up questions</small></span><Arrow /></button>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
        </div>
      </section>
      <footer className="site-footer"><Brand /><span>A little more aware. A little more you.</span><a href="#top">Back to top <Arrow direction="up" /></a></footer>
    </main>
  );
}
