'use client';

// Leaving mid-session abandons it, so ask first.
export function Restart() {
  return (
    <a className="restart" href="/" onClick={(e) => { if (!window.confirm('Leave this session and start again? Your progress here will be lost.')) e.preventDefault(); }}>
      Start again
    </a>
  );
}
