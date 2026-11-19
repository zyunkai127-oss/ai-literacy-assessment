'use client';

import { useState } from 'react';
import { Arrow, Brand } from './ui';

export default function Consent() {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function begin() {
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ understood }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Unable to start your session. Please try again.');
      }
      window.location.href = `/assessment/${body.id}`;
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
          <a className="button header-cta" href="#before-you-start">Start assessment</a>
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
              Two classroom tasks that show how you revise an argument and use evidence to make a decision.
            </p>
            <a className="button hero-cta" href="#before-you-start">
              Get started <Arrow />
            </a>
            <ul className="hero-benefits">
              <li>Discuss your argument with AI after writing your first draft</li>
              <li>Receive feedback based on your own session</li>
              </ul>
          </div>

          <section className="activity-picker" aria-labelledby="picker-title">
            <h2 id="picker-title">Your two tasks</h2>
            <div className="picker-body">
              <ol className="task-previews">
                <li>
                  <strong>Dramatic Moments</strong>
                  <p>Write a first draft on your own, then discuss and revise it with AI.</p>
                </li>
                <li>
                  <strong>Choosing a Wind Farm Site</strong>
                  <p>Use weather records and a windmill experiment to recommend a region for a survey.</p>
                </li>
              </ol>
              <p>Complete both tasks in order · About 20–30 minutes</p>
              <a className="button picker-cta" href="#before-you-start">Before you start <Arrow /></a>
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
          Practise using AI in two secondary-school assignments. Your feedback looks at the work you submit and the decisions you make along the way.
        </p>
        <div className="overview-features">
          <article>
            <h3>Write an argument</h3>
            <p>Consider why people remember dramatic moments and what those stories leave out.</p>
          </article>
          <article>
            <h3>Compare evidence</h3>
            <p>Look at wind observations and experiment readings to decide where a longer survey would help.</p>
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
              <h3>Draft and revise</h3>
              <p>Submit your independent first draft, discuss it with the assistant and decide what to change.</p>
            </article>
            <article>
              <h3>Make a recommendation</h3>
              <p>Open the evidence pack and use AI from the start of the science task. Explain your choice and compare it with an alternative.</p>
            </article>
            <article>
              <h3>Review your feedback</h3>
              <p>After submitting both tasks, see what your work shows and what you could try next time.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="feedback-section content-width" id="feedback" aria-labelledby="feedback-title">
        <div>
          <h2 id="feedback-title">Understand your approach to AI</h2>
          <p>Your feedback draws on your submitted drafts, wind farm recommendation and both conversations with the assistant.</p>
        </div>
        <div className="feedback-note">
          <h3>Feedback about your session</h3>
          <p>Open each skill to read the evidence and a practical suggestion for next time.</p>
        </div>
      </section>

      <section className="start-section" id="before-you-start" aria-labelledby="start-title">
        <div className="start-content">
          <div className="start-intro">
            <h2 id="start-title">Before you start</h2>
            <p>The AI in this activity may sometimes be wrong. How far to rely on it is up to you.</p>
            <p>Approach the tasks as you would your own coursework. Use the materials and make your own decisions.</p>
            <p>You can start without an account. Leave names and personal details out of your work.</p>
          </div>
          <div className="consent-panel" aria-busy={busy}>
            <h3>Your activity and privacy</h3>
            <details className="privacy-details">
              <summary>How is my data used?</summary>
              <div className="body">
                <p>Your submitted work and chat are saved under your activity link.</p>
                <p>When you use the assistant and when feedback is generated, the app sends the relevant assignment materials, writing and conversation to the AI provider.</p>
              </div>
            </details>
            <label className="check">
              <input type="checkbox" checked={understood} disabled={busy} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand that the AI in this activity may sometimes be wrong. <span className="required-label">Required</span></span>
            </label>
            <p className="consent-hint" id="start-hint">Two tasks in order · About 20–30 minutes</p>
            <button className="primary start-button" aria-describedby="start-hint" disabled={!understood || busy} onClick={begin}>
              {busy ? 'Starting your activity…' : 'Start assessment'} <Arrow />
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
