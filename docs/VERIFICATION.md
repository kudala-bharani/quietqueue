# Verification record

## Automated checks

- All 19 deterministic Node tests pass.
- Real q8 MiniLM inference ran in Node with 384-dimensional embeddings and four synthetic tasks conserved within the time budget.
- Source has explicit rule-only fallback rather than simulated AI output.

## Browser checks on GitHub Pages

- Public page loads and renders.
- Default eight-task sample produces a 30-minute session with six tasks and two parked.
- Selecting 15 minutes yields three five-minute tasks with five parked.
- Checkoff updates progress; Markdown export triggers a downloaded file.
- Actual browser AI initialization and inference succeeded after switching to the standalone Transformers.js browser bundle; UI showed On-device AI and successful local inference. Checkoff persisted across reload.
- No mobile-device test or productivity measurement is claimed.

Synthetic sample inputs only. No private user mail/calendar/documents were processed.
