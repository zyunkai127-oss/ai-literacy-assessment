'use client';
import { useState } from 'react';
import { Arrow, Brand, Spark } from './ui';

export default function Consent() {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function begin() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ understood }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to start your session. Please try again.');
      window.location.href = `/assessment/${body.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start your session. Please try again.');
      setBusy(false);
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
        <div className="section-heading"><p className="eyebrow">A small challenge for your big brain</p><h2 id="how-title">Less guessing.<br />More thinking.</h2><p>Two classroom tasks. Start with your own argument, then use evidence to choose a site for a wind farm.</p></div>
        <div className="steps">
          <article><span className="step-number">01 /</span><h3>Write and revise.</h3><p>Write a first draft of Dramatic Moments on your own, then discuss it with AI and revise it.</p></article>
          <article><span className="step-number">02 /</span><h3>Choose a wind farm site.</h3><p>Use weather records and windmill measurements to recommend a region for a longer survey. You can use AI from the start of this task.</p></article>
          <article><span className="step-number">03 /</span><h3>See your thinking.</h3><p>Review both submissions and the conversations behind your decisions.</p></article>
        </div>
      </section>
      <section className="start-section" id="before-you-start" aria-labelledby="start-title">
        <div className="start-intro"><p className="eyebrow">Before you jump in</p><h2 id="start-title">Your call.<br />Your words.</h2><p>The AI in this activity may sometimes be wrong. How far to rely on it is up to you.</p><p>This is not a hunt for mistakes. Do the task the way you would do real coursework.</p><div className="start-note"><Spark /><span>No account.<br />Just an open mind.</span></div></div>
        <div className="consent-panel" aria-busy={busy}>
          <p className="eyebrow">Make yourself comfortable</p><h3>A quick heads-up.</h3>
          <p>Your submitted work and chat are saved under your activity link. When you ask AI for help, your task, writing and conversation are sent to the AI provider. Leave out names and personal details.</p>
          <label className="check"><input type="checkbox" checked={understood} disabled={busy} onChange={(e) => setUnderstood(e.target.checked)} /><span>I understand that the AI in this activity may sometimes be wrong. <span className="required-label">Required</span></span></label>
          <p className="consent-hint">Two tasks in order · About 20–30 minutes</p>
          <button className="primary version-button" disabled={!understood || busy} onClick={begin}>{busy ? 'Starting…' : 'Start assessment'} <Arrow /></button>
          {error && <p role="alert" className="error">{error}</p>}
        </div>
      </section>
      <footer className="site-footer"><Brand /><span>A little more aware. A little more you.</span><a href="#top">Back to top <Arrow direction="up" /></a></footer>
    </main>
  );
}
