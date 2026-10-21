# QuietQueue

**Less juggling. More done.** A small, local-first task batcher built for Hacktoberfest 2026 Week 3: **Slow and Steady**.

Paste the messy list you have been avoiding. Give it a time window and an energy setting. QuietQueue groups related tasks, picks a manageable session, and parks everything else without losing it.

Optional **open-weight AI actually runs on your device**: MiniLM sentence embeddings group tasks by meaning. No hosted inference API, API key, account, or backend database. A visibly labeled rule-based mode remains available when the model is disabled or unavailable.

## Try it

[Open the live demo](https://kudala-bharani.github.io/quietqueue/).

Or run locally with any static HTTP server:

```sh
git clone https://github.com/kudala-bharani/quietqueue.git
cd quietqueue
python3 -m http.server 4173
# Open http://localhost:4173
```

There is no frontend build and no runtime package installation. `npm install` is only needed for the optional real-model integration test.

## A two-minute walkthrough

1. Try the included fictional eight-task sample, or enter one task per line.
2. Add your own estimate such as `Reply to the team [5m]`. Without one, a simple heuristic supplies 5, 15, or 20 minutes, visibly marked `est.`. These are not AI predictions.
3. Choose 15, 30, or 60 minutes. Low energy includes tasks up to 10 minutes each; medium up to 30; high up to 180. This is a planning filter, not a health assessment.
4. Optionally enable **on-device AI**, then select **Make a quiet plan**. The first run downloads roughly 23 MB of model weights plus the runtime. Downloads can take longer on slower networks.
5. Work through a batch, check things off, and export the plan as Markdown. Tasks outside the session remain in the parking lot.

The number of avoided context changes compares the **same selected tasks** in their original order against the grouped order. It is not a claim about time saved or measured productivity.

## Where the AI is

`ai.mjs` uses pinned **Transformers.js 3.8.1** and the quantized **Xenova/all-MiniLM-L6-v2** ONNX model, an Apache-2.0 conversion of Sentence Transformers' open-weight MiniLM model.

1. Task sentences and six context descriptions are embedded locally into 384-dimensional vectors.
2. `core.mjs` uses cosine similarity to assign contexts such as messages, home chores, errands, admin, and focused work.
3. Weak matches below a 0.24 cosine threshold stay in “The little loose ends.” Similarity is not a calibrated confidence probability.
4. A bounded, exact dynamic program selects tasks under the time and energy constraints. Its preference score rewards task count and discourages opening extra contexts. The planner itself is transparent deterministic code, not another model call.

This separation is deliberate: a model handles fuzzy language; code enforces hard limits. The model does not invent tasks, deadlines, or durations and never takes actions on your behalf.

For example, the real-model integration fixture groups “Send a note to the team” with “Respond to an invitation,” even though neither matches the basic message keyword list. Ambiguous expressions may still land in loose ends. Review the result rather than treating it as a priority judgment.

## Why open matters here

- **No per-plan API fee:** inference uses the visitor's CPU. Internet bandwidth and electricity are still real costs.
- **Local task text:** tasks are not sent to a model server. Model/runtime hosts receive ordinary download requests, including network metadata such as an IP address.
- **Inspectability:** the six category descriptions, similarity threshold, budget algorithm, model identity, and fallback are all in source.
- **Replaceability:** a developer can change the anchors or replace the embedding model without rebuilding the product around a commercial API.
- **Honest degradation:** failure to load AI produces a clear rule-based label and message, not a simulated AI answer.

This is local-first, not a guaranteed fully offline PWA. The site and AI assets need an initial network load; browser caches may be cleared or evicted. The rule-based planner makes no network requests after the page loads. Fully offline packaging of the model/runtime is a possible future improvement, not a delivered feature.

## Privacy and storage

- Task text and checked task IDs are saved in this browser's `localStorage`, not synced to a server.
- “Clear local data” removes the workspace and checkoffs. It does **not** remove browser-managed model caches. Clear this site's browser storage to remove those too.
- No app analytics, advertising, accounts, trackers, or remote task execution are included. Hosting and asset providers may maintain normal access logs.
- Local storage is not encrypted. Avoid sensitive text on shared devices; other same-origin scripts/browser extensions may be able to access it.
- External runtime: `cdn.jsdelivr.net`; model files: Hugging Face and its download/CDN infrastructure. The opt-in notice is shown before loading them.

## Development and checks

Node.js 20+ is recommended for tests; the submitted code was tested on Node.js 24.

```sh
npm test                  # 19 deterministic tests, no dependency install needed
npm ci                    # optional: pinned real-model test dependency
npm run test:model        # downloads/runs the actual open-weight model on synthetic text
```

The real-model test exercises the pretrained embeddings and final planner, not a mock. Tests cover budgets, energy limits, task conservation, duplicates, input limits, invalid model outputs, context-count accounting, Markdown provenance, stable IDs, and the 60-task bound.

Browser verification and known limitations are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md). All bundled sample names and tasks are fictional.

## Project map

- `index.html`, `styles.css`: accessible responsive UI and original sloth illustration
- `app.js`: local workspace, safe text rendering, async race handling, checkoffs and export
- `ai.mjs`: opt-in Transformers.js model loading and inference
- `core.mjs`: task parsing, semantic/rule classification and bounded planning
- `tests/core.test.mjs`: deterministic unit tests
- `scripts/test-model.mjs`: opt-in real-model integration test
- `THIRD_PARTY_NOTICES.md`: upstream model and runtime attribution

## Limits and future improvements

English-first embeddings; six general contexts; duration and energy heuristics; no dependencies or urgency ordering; no calendar/inbox access; no automatic execution. A 60-task and 18,000-character limit bounds computation. Short, unusual, or metaphorical tasks can be misclassified. A useful next step is a user-editable category override, followed by a documented offline package.

## Challenge provenance and AI assistance

This is a **brand-new project and repository**, started on **October 20, 2026** for the Week 3 challenge. It is not an extension of an earlier entry. AI coding assistance was used for planning, implementation, tests, and documentation. The runtime AI is the open-weight MiniLM integration described above; it is separate from the development assistant.

Any changes after the challenge deadline will be noted here. None at the initial submission.

## License

Original QuietQueue code: [MIT](LICENSE). The pretrained model and third-party runtime retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for Apache-2.0 and MIT upstream attribution. No model training or fine-tuning is claimed.
