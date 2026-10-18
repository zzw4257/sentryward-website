import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, execution, analyze, violations, edits } from '../js/sync-foundations-model.mjs';

// Independently visit every reachable completed-event set. This checks the
// path-based analyzer against the declared topological-prefix semantics.
function exhaustiveCheck(model) {
  const ids = model.events.map(event => event.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const masks = ids.map(id => model.edges.filter(edge => edge.to === id)
    .reduce((mask, edge) => mask | (1 << index.get(edge.from)), 0));
  const seen = new Set([0]), pending = [0];
  let hasViolation = false;
  while (pending.length) {
    const mask = pending.pop();
    for (const duty of model.duties) {
      if ((mask & (1 << index.get(duty.to))) && !(mask & (1 << index.get(duty.from)))) hasViolation = true;
    }
    for (let i = 0; i < ids.length; i++) {
      if ((mask & (1 << i)) || (mask & masks[i]) !== masks[i]) continue;
      const next = mask | (1 << i);
      if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
  }
  return { hasViolation, prefixes: seen.size };
}

test('all six input/edit combinations agree with exhaustive completed-event sets', () => {
  for (const tiles of [2, 3]) for (const edit of edits) {
    const model = buildModel(tiles, edit.id);
    const exact = exhaustiveCheck(model);
    assert.equal(analyze(model).meetsContract, !exact.hasViolation, `${tiles} / ${edit.id}`);
    assert.ok(exact.prefixes > 1);
  }
});

test('reuse duties arise only when the third tile reuses slot zero', () => {
  assert.equal(analyze(buildModel(2, 'remove-reuse')).meetsContract, true);
  const result = analyze(buildModel(3, 'remove-reuse'));
  assert.equal(result.meetsContract, false);
  assert.deepEqual(result.missing.map(({ from, to }) => [from, to]), [['R0', 'W2']]);
});

test('displayed witnesses obey every candidate edge and violate the indicated duty', () => {
  for (const tiles of [2, 3]) for (const edit of edits) {
    const model = buildModel(tiles, edit.id), result = analyze(model);
    const traces = [execution(model, 'copy-led'), execution(model, 'compute-led')];
    if (result.witness) traces.push(result.witness.trace);
    for (const trace of traces) {
      assert.equal(new Set(trace.map(event => event.id)).size, model.events.length);
      const at = new Map(trace.map((event, i) => [event.id, i]));
      for (const edge of model.edges) assert.ok(at.get(edge.from) < at.get(edge.to));
    }
    if (result.witness) {
      const { duty, trace, prefixLength } = result.witness;
      assert.ok(violations(model, trace.slice(0, prefixLength))
        .some(item => item.from === duty.from && item.to === duty.to));
    }
  }
});

test('a passing sampled execution cannot establish correctness of the edited program', () => {
  const model = buildModel(3, 'remove-reuse');
  assert.equal(violations(model, execution(model, 'compute-led')).length, 0);
  assert.ok(violations(model, execution(model, 'copy-led')).length > 0);
  assert.equal(analyze(model).meetsContract, false);
});
