import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXTS, parseTasks, planTasks, cosine, buildMarkdown } from '../core.mjs';

test('parses bullets, durations, blank lines and stable ids', () => {
  const tasks = parseTasks('- Water plants [3m]\n\n2. Reply to email (5 min)\nWrite outline');
  assert.equal(tasks.length, 3); assert.equal(tasks[0].text, 'Water plants'); assert.equal(tasks[0].minutes, 3); assert.equal(tasks[0].explicitDuration, true);
  assert.equal(tasks[1].minutes, 5); assert.equal(tasks[2].minutes, 20); assert.equal(tasks[2].explicitDuration, false);
  assert.equal(tasks[0].id, parseTasks('Water plants [3m]')[0].id);
});
test('duplicate task lines stay separate and ids stay unique', () => { const t = parseTasks('Water plants\nWater plants'); assert.equal(t.length, 2); assert.notEqual(t[0].id, t[1].id); });
test('empty input is a valid empty plan', () => { const p = planTasks(parseTasks(' \n ')); assert.equal(p.selectedCount, 0); assert.equal(p.switchesSaved, 0); assert.equal(p.mode, 'rules'); });
test('invalid durations and names fail clearly', () => { assert.throws(() => parseTasks('Water [0m]'), /1 to 180/); assert.throws(() => parseTasks('Water [999m]'), /1 to 180/); assert.throws(() => parseTasks('[10m]'), /needs a name/); });
test('input size is bounded without silent truncation', () => { assert.throws(() => parseTasks('task\n'.repeat(61)), /60 tasks/); assert.throws(() => parseTasks('a'.repeat(281)), /280/); assert.throws(() => parseTasks('a'.repeat(18001)), /18,000/); });
test('budgets are enforced, skipped tasks remain parked', () => { const tasks = parseTasks('Reply [5m]\nClean [10m]\nResearch [20m]'); const p = planTasks(tasks, {budget:15}); assert.equal(p.selectedMinutes, 15); assert.equal(p.selectedCount, 2); assert.equal(p.parked.length, 1); assert.equal(p.parked[0].text, 'Research'); });
test('a task larger than budget is not falsely marked completed', () => { const p = planTasks(parseTasks('Write [40m]'),{budget:15,energy:'high'}); assert.equal(p.selectedCount,0); assert.equal(p.parked.length,1); });
test('low energy admits only tasks of ten minutes or less', () => { const p = planTasks(parseTasks('Write [20m]\nWater [3m]'),{budget:30,energy:'low'}); assert.equal(p.selectedCount,1); assert.equal(p.parked[0].text,'Write'); assert.match(p.parked[0].reason,/energy/); });
test('all tasks conserved exactly once', () => { const t = parseTasks('Email [5m]\nClean [10m]\nRead [20m]\nBuy milk [15m]'); const p = planTasks(t,{budget:30}); const all = [...p.batches.flatMap(b => b.tasks),...p.parked]; assert.equal(all.length,t.length); assert.equal(new Set(all.map(t=>t.id)).size,t.length); });
test('switch savings compare the same selected tasks, not original full list', () => { const p = planTasks(parseTasks('Email [5m]\nClean [5m]\nReply [5m]\nWater plants [5m]'),{budget:30}); assert.equal(p.switchesBefore,3); assert.equal(p.switchesAfter,1); assert.equal(p.switchesSaved,2); });
test('context switch counts do not claim time savings', () => { const p=planTasks(parseTasks('Email\nReply')); assert.equal(p.switchesSaved,0); assert.match(buildMarkdown(p),/not a measured time saving/); });
test('cosine handles zero and invalid dimensions', () => { assert.equal(cosine([1,0],[1,0]),1); assert.equal(cosine([0,0],[1,0]),0); assert.equal(cosine([1],[1,0]),0); });
test('real embedding path controls grouping, without keyword override', () => {
 const vectors=[[1,0,0,0,0,0],[1,0,0,0,0,0]], contexts=CONTEXTS.map((_,i)=>CONTEXTS.map((_,j)=>i===j?1:0));
 const p=planTasks(parseTasks('Mystery A [5m]\nMystery B [5m]'),{embeddings:{vectors,contexts}});
 assert.equal(p.mode,'ai'); assert.equal(p.batches.length,1); assert.equal(p.batches[0].id,'messages');
});
test('malformed embeddings are rejected rather than labeled AI', () => { assert.throws(()=>planTasks(parseTasks('Task'),{embeddings:{vectors:[[NaN]],contexts:[]}}),/incomplete embeddings/); });
test('planner does not mutate its input', () => { const t=parseTasks('Email\nClean'); const copy=JSON.stringify(t); planTasks(t); assert.equal(JSON.stringify(t),copy); });
test('Markdown includes grouping provenance and checked tasks', () => { const t=parseTasks('Email [5m]\nClean [10m]'); const p=planTasks(t); const md=buildMarkdown(p,[t[0].id]); assert.match(md, /Rule-based grouping \(no AI\)/); assert.match(md, /\[x\] Email/); });
test('invalid options do not silently change user constraints', () => { assert.throws(()=>planTasks([],{budget:-1}),/time budget/); assert.throws(()=>planTasks([],{energy:'exhausted'}),/energy/); });
test('one context is preferred for otherwise equal task count', () => { const p=planTasks(parseTasks('Email [5m]\nWater [5m]\nReply [5m]'),{budget:10}); assert.equal(p.batches.length,1); assert.equal(p.batches[0].id,'messages'); });
test('60-task bounded planner conserves tasks and meets budget', () => { const t=parseTasks(Array.from({length:60},(_,i)=>`${['Email','Clean','Buy milk','Organize','Write','Misc'][i%6]} ${i} [${i%9+1}m]`).join('\n')); const p=planTasks(t,{budget:60,energy:'high'}); assert.ok(p.selectedMinutes<=60); assert.equal(p.selectedCount+p.parked.length,60); });
