/** QuietQueue's deterministic planner. No network, DOM, or model dependencies. */
export const CONTEXTS = Object.freeze([
  { id: 'messages', title: 'Messages & calls', anchor: 'Reply to messages and emails, call someone, send a reply, follow up and schedule a meeting.', words: /\b(email|reply|message|call|text|follow.?up|schedule|invite|rsvp)\b/i },
  { id: 'home', title: 'A little home reset', anchor: 'Clean and tidy the house, wash laundry and dishes, water plants, put things away, take out recycling.', words: /\b(clean|tidy|laundry|dishes|water|plants|recycl\w*|vacuum|wash|kitchen|closet|bed|sweep|trash)\b/i },
  { id: 'errands', title: 'One trip out', anchor: 'Go out to buy groceries, pick up a package, return a library book, collect dry cleaning, visit the post office.', words: /\b(buy|grocer\w*|pick.?up|collect|post office|store|shop|return|library|pharmacy|drop.?off)\b/i },
  { id: 'admin', title: 'A small admin sweep', anchor: 'Organize receipts and files, fill in forms, book appointments, renew subscriptions, update a spreadsheet and pay a bill.', words: /\b(receipt|files?|forms?|book|renew|subscription|spreadsheet|bill|invoice|expense|download|organize|sort|admin)\b/i },
  { id: 'focus', title: 'A little focused work', anchor: 'Write and edit a document, read a report, study, design, code, research and prepare a presentation.', words: /\b(write|edit|read|report|study|design|code|research|prepare|draft|presentation|learn|review)\b/i },
  { id: 'other', title: 'The little loose ends', anchor: 'Other everyday personal tasks, small miscellaneous to-dos and general chores.', words: /$a/ }
]);
const LIMIT = 60;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }
export function parseTasks(input) {
  if (typeof input !== 'string') throw new TypeError('Your brain dump needs to be text.');
  if (input.length > 18000) throw new Error('Keep this brain dump under 18,000 characters.');
  const lines = input.split(/\r?\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (lines.length > LIMIT) throw new Error('Try up to 60 tasks at a time. Nothing has been removed.');
  const seen = new Map();
  return lines.map((line, index) => {
    const marker = line.match(/\[\s*(\d{1,3})\s*(?:m|min|mins|minutes?)\s*\]/i) || line.match(/\(\s*(\d{1,3})\s*(?:m|min|mins|minutes?)\s*\)\s*$/i);
    const text = (marker ? line.replace(marker[0], '') : line).trim();
    if (!text) throw new Error(`Task ${index + 1} needs a name, not just a duration.`);
    if (text.length > 280) throw new Error(`Task ${index + 1} is longer than 280 characters. Split it into smaller steps.`);
    const minutes = marker ? Number(marker[1]) : /\b(write|draft|design|study|research|deep|presentation)\b/i.test(text) ? 20 : /\b(clean|organize|sort|read|grocer|laundry|review)\b/i.test(text) ? 15 : 5;
    if (minutes < 1 || minutes > 180) throw new Error(`Task ${index + 1}: use a duration from 1 to 180 minutes.`);
    const key = text.toLocaleLowerCase('en'); const occurrence = seen.get(key) || 0; seen.set(key, occurrence + 1);
    return { id: `t-${hash(key)}-${occurrence}`, text, minutes, explicitDuration: Boolean(marker), index };
  });
}
export function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function ruleContext(text) { const i = CONTEXTS.findIndex(c => c.words.test(text)); return i < 0 ? CONTEXTS.length - 1 : i; }
function validateEmbeddings(embeddings, count) {
  if (!embeddings) return false;
  const vectors = embeddings.vectors, contexts = embeddings.contexts;
  const dim = vectors?.[0]?.length;
  if (!Array.isArray(vectors) || vectors.length !== count || !Array.isArray(contexts) || contexts.length !== CONTEXTS.length || !dim || ![...vectors, ...contexts].every(v => Array.isArray(v) && v.length === dim && v.every(Number.isFinite))) throw new Error('The model returned incomplete embeddings. Try the rule-based planner instead.');
  return true;
}
const popcount = n => { let count = 0; while (n) { count += n & 1; n >>>= 1; } return count; };
const transitions = list => list.slice(1).reduce((n, t, i) => n + Number(t.context !== list[i].context), 0);
export function planTasks(tasks, { budget = 30, energy = 'medium', embeddings } = {}) {
  if (!Array.isArray(tasks) || tasks.length > LIMIT || tasks.some(t => !Number.isInteger(t.minutes) || t.minutes < 1 || t.minutes > 180)) throw new Error('Please provide valid tasks and durations.');
  if (!Number.isInteger(budget) || budget < 1 || budget > 180) throw new Error('Choose a time budget between 1 and 180 minutes.');
  if (!['low', 'medium', 'high'].includes(energy)) throw new Error('Choose low, medium, or high energy.');
  const useAI = tasks.length > 0 && validateEmbeddings(embeddings, tasks.length);
  const classified = tasks.map((task, index) => {
    let context = ruleContext(task.text), confidence = null;
    if (useAI) {
      const sims = embeddings.contexts.map(v => cosine(embeddings.vectors[index], v));
      const maximum = Math.max(...sims); context = maximum >= 0.24 ? sims.indexOf(maximum) : CONTEXTS.length - 1; confidence = maximum;
    }
    return { ...task, index, context, confidence };
  });
  const maxMinutes = { low: 10, medium: 30, high: 180 }[energy];
  // Small exact dynamic program: reward completed tasks and discourage opening extra contexts.
  // This is a preference heuristic, NOT a measurement of productivity or urgency.
  let states = new Map([['0:0', { minutes: 0, mask: 0, chosen: [] }]]);
  for (const task of classified.filter(t => t.minutes <= maxMinutes && t.minutes <= budget)) {
    const next = new Map(states);
    for (const state of states.values()) {
      const minutes = state.minutes + task.minutes; if (minutes > budget) continue;
      const mask = state.mask | (1 << task.context), key = `${minutes}:${mask}`;
      const candidate = { minutes, mask, chosen: [...state.chosen, task] };
      if (!next.has(key) || next.get(key).chosen.length < candidate.chosen.length) next.set(key, candidate);
    }
    states = next;
  }
  const score = s => s.chosen.length * 10 - popcount(s.mask) * 2 + s.minutes / 1000;
  const best = [...states.values()].sort((a, b) => score(b) - score(a) || a.minutes - b.minutes)[0];
  const groups = new Map();
  for (const task of best.chosen) { if (!groups.has(task.context)) groups.set(task.context, []); groups.get(task.context).push(task); }
  const batches = [...groups].map(([context, group]) => ({ id: CONTEXTS[context].id, title: CONTEXTS[context].title, tasks: group, minutes: group.reduce((n, t) => n + t.minutes, 0), reason: useAI ? 'Grouped by the open model’s semantic similarity to a context description. Weak matches stay in loose ends.' : 'Grouped by transparent keyword rules, without AI.' }));
  const chosenIds = new Set(best.chosen.map(t => t.id));
  const parked = classified.filter(t => !chosenIds.has(t.id)).map(t => ({ ...t, reason: t.minutes > maxMinutes ? 'Longer than this energy setting allows.' : 'Outside this session’s time budget.' }));
  const switchesBefore = transitions(best.chosen), switchesAfter = Math.max(0, batches.length - 1);
  return { batches, parked, selectedMinutes: best.minutes, selectedCount: best.chosen.length, totalCount: tasks.length, switchesBefore, switchesAfter, switchesSaved: Math.max(0, switchesBefore - switchesAfter), mode: useAI ? 'ai' : 'rules', budget, energy };
}
export function buildMarkdown(plan, completedIds = []) {
  const completed = new Set(completedIds);
  const lines = ['# My quiet plan', '', `${plan.selectedMinutes} of ${plan.budget} minutes · ${plan.energy} energy · ${plan.mode === 'ai' ? 'Local MiniLM semantic grouping' : 'Rule-based grouping (no AI)'}`, '', 'Durations without a supplied estimate are simple heuristics, not model predictions.'];
  for (const batch of plan.batches) { lines.push('', `## ${batch.title} (${batch.minutes} min)`); for (const task of batch.tasks) lines.push(`- [${completed.has(task.id) ? 'x' : ' '}] ${task.text.replace(/[\r\n]/g, ' ')} (${task.minutes} min${task.explicitDuration ? '' : ', estimated'})`); }
  if (plan.parked.length) { lines.push('', '## Parked for another session'); for (const task of plan.parked) lines.push(`- ${task.text} (${task.minutes} min)`); }
  lines.push('', `Context changes: ${plan.switchesBefore} → ${plan.switchesAfter}, comparing the same selected tasks before and after grouping. This is not a measured time saving.`, '', 'Made with QuietQueue. Your pace is allowed.');
  return lines.join('\n');
}
