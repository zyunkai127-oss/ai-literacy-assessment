# UI redesign

Branch: `feat/ui-redesign`.

Screenshots: [desktop homepage](images/ui-homepage-desktop.png) · [mobile homepage](images/ui-homepage-mobile.png).

## Direction

Reference: [the electric-green Squadeasy capture on Recent](https://recent.design/i/rush73k-squadeasy), rather than the current peach-coloured Squadeasy website. The reference recording was inspected to identify the full green canvas, wide black typography, sparse navigation and playful dimensional character.

The homepage adapts those features to the assessment: a green introduction, three activity steps, and a consent and version-selection section. The introduction, workspace, reflection and feedback share the same semantic colours and typography. Existing session routes, source access, timers, assessment rules and storage choices are retained.

## StyleKit

Applied [AnxForever/stylekit-skill](https://github.com/AnxForever/stylekit-skill), installed as `stylekit`, version 0.8.0. Read its design-principles, mobile-ui and spec-workflow guidance and fetched the complete `neo-brutalist-playful` implementation brief from `https://www.stylekit.top/api/styles/neo-brutalist-playful/brief` (content hash `fnv1a32:e836f460`; no legacy fallback).

The brief guides bold typography, clear colour blocks, spacing, interaction states and accessibility. The user's visual reference takes priority over the brief's exact recipes: this implementation uses neon green, sans-serif body text, thin borders and rounded controls instead of the preset's coral/teal palette, monospace body, thick borders and square controls.

The spec integrity check passed with three required-table drift notices. The static class scan found no forbidden class tokens; dynamic classes were inconclusive. This app uses custom CSS, so the class evaluator does not establish visual compliance. Browser screenshots and interaction checks are the relevant validation.

## Fonts and assets

- Syne Extra Bold: wide display headings, locally hosted.
- Space Grotesk Regular and Bold: readable body copy and controls, locally hosted.
- Both are open-source substitutes for the reference typography, not Squadeasy's proprietary fonts. SIL Open Font Licenses are included in `public/fonts/`.
- The decorative character is built with CSS; no Squadeasy logo, mascot image or video is bundled.

## Validation

- `npm run typecheck`
- `npm test`: 262 tests across 10 files.
- `npm run build`
- Headless Chrome: homepage and results at 360, 390, 700, 1024 and 1440 pixels; mobile introduction and workspace; local font loading and horizontal overflow.
- Exercised required consent, optional anonymous storage, both session starts, source expansion, brief editing, submission, reflection and results. No browser page errors.
- Browser QA used a separate temporary SQLite database. Live provider chat and adaptive model responses require configured credentials and were not exercised.
