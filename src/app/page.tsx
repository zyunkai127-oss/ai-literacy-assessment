'use client';

import { useState } from 'react';
import { Arrow, Brand } from './ui';

type ActivityMode = 'judge' | 'full';

export default function Consent() {
  const [mode, setMode] = useState<ActivityMode>('judge');
  const [understood, setUnderstood] = useState(false);
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function begin() {
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, understood, store }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Unable to start your session. Please try again.');
      }
      window.location.href = `/s/${body.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start your session. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="landing" id="top">
      <a className="skip-link" href="#activity-overview">Skip to main content</a>
      <header className="site-header">
        <div className="header-content">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#activity-overview">About the activity</a>
            <a href="#how-it-works">How it works</a>
            <a href="#before-you-start">Before you start</a>
          </nav>
          <a className="button header-cta" href="#choose-activity">Start an activity</a>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className="hero-copy">
            <h1 id="hero-title">AI Literacy Check</h1>
            <p className="hero-description">
              Understand how you work with AI.
              <br />
              Build confidence in your own judgement.
            </p>
            <p className="hero-summary">
              A short, practical activity to explore how you use AI,
              check evidence and make decisions in your work.
            </p>
            <a className="button hero-cta" href="#choose-activity">
              Choose your activity <Arrow />
            </a>
            <ul className="hero-benefits">
              <li>Work with an AI assistant and a small source pack</li>
              <li>Receive feedback based on your own session</li>
              <li>Choose a 4-minute or 8-minute activity</li>
            </ul>
          </div>

          <section className="activity-picker" id="choose-activity" aria-labelledby="picker-title">
            <h2 id="picker-title">Choose your activity</h2>
            <div className="picker-body">
              <p>Choose how much time you would like to spend.</p>
              <fieldset className="mode-options" disabled={busy}>
                <legend className="sr-only">Activity version</legend>
                <label className={`mode-option ${mode === 'judge' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="activity-mode"
                    value="judge"
                    checked={mode === 'judge'}
                    onChange={() => setMode('judge')}
                  />
                  <span>
                    <span className="mode-title">Quick version <span>4 minutes</span></span>
                    <span className="mode-description">Complete the task and reflect on your choices.</span>
                  </span>
                </label>
                <label className={`mode-option ${mode === 'full' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="activity-mode"
                    value="full"
                    checked={mode === 'full'}
                    onChange={() => setMode('full')}
                  />
                  <span>
                    <span className="mode-title">Full version <span>8 minutes</span></span>
                    <span className="mode-description">The same task, with up to two follow-up questions.</span>
                  </span>
                </label>
              </fieldset>
              <a className="button picker-cta" href="#before-you-start">Continue <Arrow /></a>
            </div>
          </section>
        </div>
      </section>

      <nav className="section-nav" aria-label="On this page">
        <a href="#activity-overview">Overview</a>
        <a href="#how-it-works">Activity format</a>
        <a href="#feedback">Your feedback</a>
        <a href="#before-you-start">Get started</a>
      </nav>

      <section className="overview-section" id="activity-overview" aria-labelledby="overview-title">
        <h2 id="overview-title">What is AI Literacy Check?</h2>
        <p className="section-description">
          Explore how you use AI in a realistic coursework task. You will write
          a short briefing for a supervisor, using an AI research assistant
          and a pack of fictional sources.
        </p>
        <div className="overview-features">
          <article>
            <h3>A practical task</h3>
            <p>Read the sources, ask questions and write an 80–150 word briefing in your own words.</p>
          </article>
          <article>
            <h3>Time that suits you</h3>
            <p>Spend four minutes on the quick version, or eight minutes on the full activity.</p>
          </article>
          <article>
            <h3>Feedback you can use</h3>
            <p>See how you checked information, made choices and used the assistant’s suggestions.</p>
          </article>
        </div>
      </section>

      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="content-width">
          <h2 id="how-title">What to expect from your activity</h2>
          <div className="steps">
            <article>
              <h3>Explore the evidence</h3>
              <p>Open the source pack and ask the assistant for help with the task. Both of you have access to the same materials.</p>
            </article>
            <article>
              <h3>Write your briefing</h3>
              <p>Decide what to check, use or leave out. Include two sourced data points and a student view in your paragraph.</p>
            </article>
            <article>
              <h3>Reflect on your decisions</h3>
              <p>Submit your brief and answer a few questions about how you worked. The full version includes up to two follow-ups.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="feedback-section content-width" id="feedback" aria-labelledby="feedback-title">
        <div>
          <h2 id="feedback-title">Understand your approach to AI</h2>
          <p>Your feedback uses evidence from your chat, source opens, editor snapshots, submitted brief and follow-up answers.</p>
        </div>
        <div className="feedback-note">
          <h3>Feedback about your session</h3>
          <p>There is no overall score or ranking. Where the session does not provide enough evidence, the feedback says so.</p>
        </div>
      </section>

      <section className="start-section" id="before-you-start" aria-labelledby="start-title">
        <div className="start-content">
          <div className="start-intro">
            <h2 id="start-title">Before you start</h2>
            <p>The AI in this activity may sometimes be wrong. How far to rely on it is up to you.</p>
            <p>This is not a hunt for mistakes. Do the task the way you would do real coursework.</p>
            <p>All data, names and references in the activity are fictional. No name or account is collected.</p>
          </div>
          <div className="consent-panel" aria-busy={busy}>
            <h3>Your activity and privacy</h3>
            <details className="privacy-details">
              <summary>How is my data used?</summary>
              <div className="body">
                <p>Your chat, brief and follow-up answers are sent to the AI provider with names and contact details removed.</p>
                <p>Unless you choose anonymous storage below, your messages and brief are deleted from this app when you finish.</p>
                <p>The full version adapts up to two follow-up questions and may pause for teacher review.</p>
              </div>
            </details>
            <label className="check">
              <input type="checkbox" checked={understood} disabled={busy} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand that the AI in this activity may sometimes be wrong. <span className="required-label">Required</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={store} disabled={busy} onChange={(e) => setStore(e.target.checked)} />
              <span>Store my session anonymously to help review this prototype. <span className="optional-label">Optional</span></span>
            </label>
            <div className="activity-summary">
              <span>{mode === 'judge' ? 'Quick version · 4 minutes' : 'Full version · 8 minutes'}</span>
              <a href="#choose-activity">Change version</a>
            </div>
            <p className="consent-hint" id="start-hint">
              {understood ? 'You can now start your activity.' : 'Confirm the required statement to continue.'}
            </p>
            <button className="primary start-button" aria-describedby="start-hint" disabled={!understood || busy} onClick={begin}>
              {busy ? 'Starting your activity…' : 'Start activity'} <Arrow />
            </button>
            {error && <p role="alert" className="error">{error}</p>}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <Brand />
        <a href="#top">Back to top <Arrow direction="up" /></a>
      </footer>
    </main>
  );
}
