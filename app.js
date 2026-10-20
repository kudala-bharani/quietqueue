import { parseTasks, planTasks, buildMarkdown } from './core.mjs';
import { loadEmbeddings } from './ai.mjs';

const STORAGE_KEY = 'quietqueue.workspace.v1';
const SAMPLE = `Reply to Alex about the launch [5m]
Review the landing page copy [10m]
Send the invoice to Studio North [5m]
Reply to the design team [5m]
Draft tomorrow’s newsletter intro [10m]
Organize the project files [5m]
Read the customer feedback [5m]
Schedule the team catch-up [5m]`;
const $ = id => document.getElementById(id);
const ui = {
  input: $('task-input'), form: $('plan-form'), energy: $('energy'), ai: $('use-ai'),
  content: $('plan-content'), title: $('plan-title'), badge: $('mode-badge'),
  button: $('plan-button'), status: $('generation-status'), count: $('task-count'),
  actions: $('plan-actions'), storage: $('storage-status'), dialog: $('about-dialog')
};
let plan = null;
let completed = new Set();
let generation = 0;
let busy = false;
let toastTimer;
let storageAvailable = true;
let lastSaved = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function getBudget() { return Number(document.querySelector('input[name="budget"]:checked').value); }
function settings() { return { budget: getBudget(), energy: ui.energy.value }; }
function showToast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4500);
}
function saveState() {
  const value = JSON.stringify({ input: ui.input.value, ...settings(), completed: [...completed] });
  if (value === lastSaved) return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
    lastSaved = value;
    storageAvailable = true;
    ui.storage.textContent = 'Saved only in this browser';
  } catch {
    storageAvailable = false;
    ui.storage.textContent = 'Browser storage unavailable · not saved';
  }
}
function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data.input !== 'string' || data.input.length > 18000) return false;
    ui.input.value = data.input;
    if ([15, 30, 60].includes(data.budget)) document.querySelector(`input[name="budget"][value="${data.budget}"]`).checked = true;
    if (['low', 'medium', 'high'].includes(data.energy)) ui.energy.value = data.energy;
    if (Array.isArray(data.completed)) completed = new Set(data.completed.filter(id => typeof id === 'string').slice(0, 60));
    lastSaved = raw;
    return true;
  } catch {
    storageAvailable = false;
    ui.storage.textContent = 'Browser storage unavailable · not saved';
    return false;
  }
}
function updateCount() {
  const count = ui.input.value.split(/\r?\n/).filter(line => line.trim()).length;
  ui.count.textContent = `${count} ${count === 1 ? 'task' : 'tasks'}${count > 60 ? ' · maximum 60' : ''}`;
  ui.count.classList.toggle('count-error', count > 60);
}
function updateEnergyNote() {
  const names = { low: 'Low: tasks up to 10 min each.', medium: 'Medium: tasks up to 30 min each.', high: 'High: tasks up to 180 min each.' };
  $('energy-note').textContent = `${names[ui.energy.value]} A planning filter, not an assessment.`;
}
function setBusy(value) {
  busy = value;
  ui.button.disabled = value;
  ui.button.querySelector('span').textContent = value ? 'Finding your rhythm…' : 'Make a quiet plan';
  document.querySelector('.plan-panel').setAttribute('aria-busy', String(value));
}
function status(text = '', isError = false) {
  ui.status.textContent = text;
  ui.status.classList.toggle('error', isError);
}
function renderEmpty(title = 'A little space to begin.', description = 'Add what’s on your mind, then make a plan that fits the time you have.') {
  ui.content.innerHTML = `<div class="empty-state"><span class="empty-leaf" aria-hidden="true">⌁</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
  ui.actions.hidden = true;
  ui.badge.hidden = true;
  ui.title.textContent = `Your next ${getBudget()} minutes`;
}
function markDirty({ resetChecks = false } = {}) {
  generation++;
  if (busy) setBusy(false);
  if (resetChecks) completed.clear();
  plan = null;
  updateCount();
  updateEnergyNote();
  status();
  renderEmpty(ui.input.value.trim() ? 'A fresh start is ready.' : 'A little space to begin.', ui.input.value.trim() ? 'Your list or settings changed. Make a quiet plan to see what fits now.' : undefined);
  saveState();
}
function duration(task) {
  return `${task.minutes}m${task.explicitDuration ? '' : ' est.'}`;
}
function renderPlan() {
  if (!plan) return renderEmpty();
  ui.title.textContent = `Your next ${plan.budget} minutes`;
  ui.badge.hidden = false;
  ui.badge.classList.toggle('ai-mode', plan.mode === 'ai');
  ui.badge.innerHTML = `<span></span>${plan.mode === 'ai' ? 'On-device AI' : 'Rule-based'}`;
  const remaining = Math.max(0, plan.budget - plan.selectedMinutes);
  const modeExplanation = plan.mode === 'ai' ? 'Grouped by meaning, on your device.' : 'Grouped with simple rules. No AI used.';
  const explanation = `${modeExplanation} ${remaining ? `${remaining} min of breathing room.` : 'A full little session. Take a break whenever you need.'}`;
  const completedCount = plan.batches.flatMap(batch => batch.tasks).filter(task => completed.has(task.id)).length;
  const batches = plan.batches.map((batch, index) => `<article class="batch" aria-labelledby="batch-${escapeHtml(batch.id)}">
    <div class="batch-header"><span class="batch-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><h3 class="batch-title" id="batch-${escapeHtml(batch.id)}">${escapeHtml(batch.title)}</h3><span class="batch-duration">${batch.minutes} min</span></div>
    <ul class="batch-task-list">${batch.tasks.map(task => `<li class="task-row"><label class="task-label"><input type="checkbox" data-task-id="${escapeHtml(task.id)}"${completed.has(task.id) ? ' checked' : ''}><span class="task-text">${escapeHtml(task.text)}</span><span class="task-minutes" title="${task.explicitDuration ? 'Your time estimate' : 'Simple rule-based time estimate, not an AI prediction'}">${escapeHtml(duration(task))}</span></label></li>`).join('')}</ul>
    <p class="batch-why"><span aria-hidden="true">↳</span>${escapeHtml(batch.reason || 'Similar tasks, one headspace.')}</p>
  </article>`).join('');
  const parked = plan.parked.length ? `<details class="parking-lot"><summary><span class="parking-icon" aria-hidden="true">⌑</span><h3>Parked, not forgotten</h3><span class="parking-count">${plan.parked.length} ${plan.parked.length === 1 ? 'task' : 'tasks'} for later</span><span class="parking-chevron" aria-hidden="true">⌄</span></summary><p class="parking-note">Not everything needs to fit today. These tasks stay on your list.</p><ul class="parking-list">${plan.parked.map(task => `<li><span>${escapeHtml(task.text)}<span class="parked-reason">${escapeHtml(task.reason || 'Outside this session’s time budget.')}</span></span><span class="task-minutes">${escapeHtml(duration(task))}</span></li>`).join('')}</ul></details>` : '';
  ui.content.innerHTML = `<div class="plan-stats" aria-label="Plan summary">
    <div class="stat"><span class="stat-value">${plan.selectedMinutes}<small>/ ${plan.budget} min</small></span><span class="stat-label">A realistic little window</span></div>
    <div class="stat"><span class="stat-value">${plan.selectedCount}<small>of ${plan.totalCount}</small></span><span class="stat-label">Tasks in your session</span></div>
    <div class="stat"><span class="stat-value"><span class="stat-savings-icon" aria-hidden="true">↘</span>${plan.switchesSaved}</span><span class="stat-label">Context switches avoided</span></div>
  </div>
  <p class="plan-explainer"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v2m0 8v2M3 9h2m8 0h2M5 5l1 1m6 6 1 1M5 13l1-1m6-6 1-1"/></svg>${escapeHtml(explanation)}</p>
  ${batches || `<div class="empty-state short-empty"><span class="empty-leaf" aria-hidden="true">⌁</span><h3>Give this a little more room.</h3><p>No task fits this time and energy setting. Try more time, a different energy level, or a smaller first step.</p></div>`}
  ${plan.selectedCount ? `<div class="progress-line"><span id="completion-text">${completedCount} of ${plan.selectedCount} done</span><div class="progress-track" role="progressbar" aria-label="Tasks completed" aria-valuemin="0" aria-valuemax="${plan.selectedCount}" aria-valuenow="${completedCount}"><div class="progress-fill" style="width:${Math.round(completedCount / plan.selectedCount * 100)}%"></div></div><span id="completion-nudge">${completedCount === plan.selectedCount ? 'A good place to pause.' : 'One thing at a time.'}</span></div>` : ''}
  <p class="metric-note">${plan.switchesBefore} → ${plan.switchesAfter} context changes for the same selected tasks. Not measured time saved.</p>
  ${parked}`;
  ui.actions.hidden = false;
}
function updateCompletion() {
  if (!plan || !plan.selectedCount) return;
  const count = plan.batches.flatMap(batch => batch.tasks).filter(task => completed.has(task.id)).length;
  $('completion-text').textContent = `${count} of ${plan.selectedCount} done`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(count));
  document.querySelector('.progress-fill').style.width = `${Math.round(count / plan.selectedCount * 100)}%`;
  $('completion-nudge').textContent = count === plan.selectedCount ? 'A good place to pause.' : 'One thing at a time.';
  if (count === plan.selectedCount) showToast('That’s your little session done. Take a breath.');
  saveState();
}
async function generatePlan({ initial = false } = {}) {
  if (busy) return;
  const thisGeneration = ++generation;
  let tasks;
  status();
  try {
    tasks = parseTasks(ui.input.value);
  } catch (error) {
    plan = null;
    renderEmpty('A small adjustment first.', error.message);
    status(error.message, true);
    ui.input.setAttribute('aria-invalid', 'true');
    if (!initial) ui.input.focus();
    return;
  }
  ui.input.removeAttribute('aria-invalid');
  if (!tasks.length) {
    plan = null;
    renderEmpty();
    if (!initial) { status('Add at least one task to make a plan.'); ui.input.focus(); }
    return;
  }
  const selectedSettings = settings();
  const wantsAI = ui.ai.checked && !initial;
  setBusy(true);
  let embeddings;
  let fallback = false;
  if (wantsAI) {
    let acceptProgress = true;
    let modelTimeout;
    try {
      embeddings = await Promise.race([
        loadEmbeddings(tasks.map(task => task.text), message => {
          if (thisGeneration === generation && acceptProgress) status(message);
        }),
        new Promise((_, reject) => {
          modelTimeout = setTimeout(() => reject(new Error('Model loading took too long.')), 90000);
        })
      ]);
    } catch {
      fallback = true;
    } finally {
      acceptProgress = false;
      clearTimeout(modelTimeout);
    }
  }
  if (thisGeneration !== generation) return;
  try {
    try {
      plan = planTasks(tasks, { ...selectedSettings, embeddings });
    } catch (error) {
      if (!embeddings) throw error;
      fallback = true;
      plan = planTasks(tasks, selectedSettings);
    }
    const validIds = new Set(tasks.map(task => task.id));
    completed = new Set([...completed].filter(id => validIds.has(id)));
    renderPlan();
    saveState();
    if (fallback) status('The model couldn’t load. Your plan uses local rules instead. You can try AI again when online.', true);
    else if (wantsAI) status('Ready. AI grouping ran on your device; time estimates use simple rules.');
    else if (!initial) status('Ready. Your rule-based plan stays in this browser.');
  } catch (error) {
    plan = null;
    renderEmpty('Let’s try a simpler start.', 'Check your task durations and try again.');
    status(error.message || 'Something went wrong. Please try again.', true);
  } finally {
    if (thisGeneration === generation) setBusy(false);
  }
}

ui.form.addEventListener('submit', event => { event.preventDefault(); generatePlan(); });
ui.input.addEventListener('input', () => { ui.input.removeAttribute('aria-invalid'); markDirty({ resetChecks: true }); });
document.querySelectorAll('input[name="budget"]').forEach(input => input.addEventListener('change', () => markDirty()));
ui.energy.addEventListener('change', () => markDirty());
ui.ai.addEventListener('change', () => {
  if (busy) markDirty();
  status(ui.ai.checked ? 'AI is enabled for your next plan. Model files will download when you choose “Make a quiet plan”.' : 'AI is off. Your next plan will use local rules.');
});
$('sample-button').addEventListener('click', () => {
  ui.input.value = SAMPLE;
  ui.ai.checked = false;
  completed.clear();
  markDirty({ resetChecks: true });
  generatePlan();
});
ui.content.addEventListener('change', event => {
  const input = event.target.closest('input[data-task-id]');
  if (!input || !plan) return;
  if (input.checked) completed.add(input.dataset.taskId); else completed.delete(input.dataset.taskId);
  updateCompletion();
});
$('export-button').addEventListener('click', () => {
  if (!plan) return;
  try {
    const blob = new Blob([buildMarkdown(plan, [...completed])], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-quiet-plan.md';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Your plan is ready as a Markdown file.');
  } catch {
    showToast('This browser couldn’t export the file. Your plan is still here.');
  }
});
$('clear-data').addEventListener('click', () => {
  generation++;
  setBusy(false);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* The workspace is cleared even without storage. */ }
  lastSaved = null;
  completed.clear();
  ui.input.value = '';
  ui.input.removeAttribute('aria-invalid');
  ui.ai.checked = false;
  ui.energy.value = 'medium';
  document.querySelector('input[name="budget"][value="30"]').checked = true;
  plan = null;
  updateCount();
  updateEnergyNote();
  status();
  renderEmpty();
  ui.storage.textContent = storageAvailable ? 'No saved tasks in this browser' : 'Browser storage unavailable · not saved';
  showToast('Saved tasks and checkoffs cleared. Downloaded model files may remain in your browser cache.');
});
function openAbout(event) {
  event?.preventDefault();
  if (!ui.dialog.open) ui.dialog.showModal();
}
document.querySelectorAll('.about-trigger').forEach(button => button.addEventListener('click', openAbout));
$('source-link').addEventListener('click', event => { if ($('source-link').getAttribute('href') === '#about') openAbout(event); });
$('close-dialog').addEventListener('click', () => ui.dialog.close());
$('dialog-done').addEventListener('click', () => ui.dialog.close());
ui.dialog.addEventListener('click', event => {
  if (event.target !== ui.dialog) return;
  const rect = ui.dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ui.dialog.close();
});
if (!restoreState()) ui.input.value = SAMPLE;
ui.ai.checked = false;
updateCount();
updateEnergyNote();
generatePlan({ initial: true });
