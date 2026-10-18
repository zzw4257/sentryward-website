// A finite order model for the research article, not a PTX interpreter.
// One write and one read represent a whole tile. Every topological execution
// is admitted; no visibility, barrier-counter, or scheduling-priority rules
// are implicit in this model.
export const edits = Object.freeze([
  { id: 'intact', label: 'Keep both waits' },
  { id: 'remove-ready', label: 'Remove data-ready waits' },
  { id: 'remove-reuse', label: 'Remove slot-reuse waits' }
]);

export function buildModel(tiles, edit = 'intact') {
  if (![2, 3].includes(tiles)) throw new RangeError('Choose two or three tiles.');
  if (!edits.some(item => item.id === edit)) throw new RangeError('Unknown edit.');
  const events = [], edges = [], duties = [];
  const add = (from, to, reason) => edges.push({ from, to, reason });
  for (let t = 0; t < tiles; t++) {
    const slot = t % 2;
    for (const [kind, lane, label] of [
      ['I', 0, 'Issue copy'], ['W', 1, 'Write shared slot'],
      ['J', 2, 'Issue computation'], ['R', 3, 'Read shared slot'],
      ['F', 3, 'Finish computation']
    ]) events.push({ id: `${kind}${t}`, kind, lane, tile: t, slot,
      label: `${label} for tile ${t}` });
    add(`I${t}`, `W${t}`, 'An asynchronous write follows its issue.');
    add(`J${t}`, `R${t}`, 'The compute engine reads after issue.');
    add(`R${t}`, `F${t}`, 'The computation finishes after its read.');
    if (t > 0) {
      add(`I${t - 1}`, `I${t}`, 'Producer program order.');
      add(`F${t - 1}`, `J${t}`, 'This example serializes computations.');
    }
    duties.push({ from: `W${t}`, to: `R${t}`, kind: 'ready',
      label: `Write tile ${t} before reading tile ${t}.` });
    if (edit !== 'remove-ready') add(`W${t}`, `J${t}`, 'Data-ready wait.');
    if (t >= 2) {
      duties.push({ from: `R${t - 2}`, to: `W${t}`, kind: 'reuse',
        label: `Read tile ${t - 2} before overwriting slot ${slot} with tile ${t}.` });
      if (edit !== 'remove-reuse') add(`F${t - 2}`, `I${t}`, 'Slot-reuse wait.');
    }
  }
  return { tiles, slots: 2, edit, events, edges, duties };
}

export function predecessors(model, target) {
  return model.edges.filter(edge => edge.to === target).map(edge => edge.from);
}

export function ancestors(model, target) {
  const found = new Set(), pending = predecessors(model, target);
  while (pending.length) {
    const id = pending.pop();
    if (found.has(id)) continue;
    found.add(id); pending.push(...predecessors(model, id));
  }
  return found;
}

export function ordered(model, from, to) {
  return ancestors(model, to).has(from);
}

export function execution(model, mode = 'copy-led', preferred = new Set()) {
  if (!['copy-led', 'compute-led'].includes(mode)) throw new RangeError('Unknown execution mode.');
  const done = new Set(), trace = [];
  const byId = new Map(model.events.map(event => [event.id, event]));
  while (trace.length < model.events.length) {
    const enabled = model.events.filter(event => !done.has(event.id)
      && predecessors(model, event.id).every(id => done.has(id)));
    if (!enabled.length) throw new Error('The finite example unexpectedly contains a cycle.');
    enabled.sort((a, b) => {
      const priority = Number(preferred.has(b.id)) - Number(preferred.has(a.id));
      if (priority) return priority;
      if (mode === 'compute-led') return a.tile - b.tile || 'WRFJI'.indexOf(a.kind) - 'WRFJI'.indexOf(b.kind);
      const rank = { I: 0, W: 1, J: 2, R: 3, F: 4 };
      return rank[a.kind] - rank[b.kind] || a.tile - b.tile;
    });
    const next = enabled[0].id;
    done.add(next); trace.push(byId.get(next));
  }
  return trace;
}

export function analyze(model) {
  const missing = model.duties.filter(duty => !ordered(model, duty.from, duty.to));
  if (!missing.length) return { meetsContract: true, missing: [], witness: null };
  const duty = missing[0];
  // For the reuse example, the copy-led execution also makes the overwrite
  // intuitive: W0, W1, W2 precede the read of tile 0.
  let trace = execution(model, 'copy-led');
  if (!violations(model, trace).some(item => item.from === duty.from && item.to === duty.to)) {
    const prefix = ancestors(model, duty.to); prefix.add(duty.to);
    trace = execution(model, 'copy-led', prefix);
  }
  return { meetsContract: false, missing,
    witness: { duty, trace, prefixLength: trace.findIndex(event => event.id === duty.to) + 1 } };
}

export function violations(model, prefix) {
  const positions = new Map(prefix.map((event, i) => [event.id, i]));
  return model.duties.filter(duty => positions.has(duty.to)
    && (!positions.has(duty.from) || positions.get(duty.to) < positions.get(duty.from)));
}

export function slotsAfter(prefix) {
  const slots = [null, null];
  for (const event of prefix) if (event.kind === 'W') slots[event.slot] = event.tile;
  return slots;
}
