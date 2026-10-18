import { buildModel, execution, analyze, violations, slotsAfter, edits } from './sync-foundations-model.mjs';

const article = document.getElementById('main');
const get = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let model, result, trace, position = 0, frame = null, previousGuide = null;

function element(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}
function text(parent, x, y, content, cls = '', anchor = 'middle') {
  const node = element('text', { x, y, 'text-anchor': anchor, class: cls }, parent);
  node.textContent = content; return node;
}
function canvas(host, width, height, label, markerId) {
  host.replaceChildren();
  const svg = element('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label }, host);
  const defs = element('defs', {}, svg);
  for (const [suffix, color] of [['ordinary', '#737e89'], ['wait', '#1e5c9b']]) {
    const marker = element('marker', { id: `${markerId}-${suffix}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
    element('path', { d: 'M0,0 L8,4 L0,8 Z', fill: color }, marker);
  }
  return svg;
}

function drawDependencies() {
  const host = get('dependency-figure'), width = host.clientWidth;
  if (!width) return;
  const svg = canvas(host, width, 248, 'One tile: copy issue precedes its write; compute issue precedes its read and finish. A data-ready wait orders the write before compute issue.', 'foundation');
  const w = Math.min(126, width * .24), h = 58;
  const points = { I: [width * .2, 50], W: [width * .8, 50], J: [width * .15, 188], R: [width * .5, 188], F: [width * .85, 188] };
  const compact = width < 400;
  const labels = { I: ['I₀', 'copy issue'], W: ['W₀', compact ? 'write' : 'shared write'], J: ['J₀', compact ? 'issue' : 'compute issue'], R: ['R₀', compact ? 'read' : 'shared read'], F: ['F₀', compact ? 'finish' : 'compute done'] };
  for (const [a, b] of [['I', 'W'], ['J', 'R'], ['R', 'F']]) {
    const [x1, y1] = points[a], [x2, y2] = points[b];
    element('path', { d: `M${x1 + w / 2},${y1} H${x2 - w / 2 - 3}`, class: 'order-link', 'marker-end': 'url(#foundation-ordinary)' }, svg);
  }
  element('path', { d: `M${points.W[0]},79 V116 H${points.J[0]} V156`, class: 'order-link wait-link', 'marker-end': 'url(#foundation-wait)' }, svg);
  text(svg, width / 2, 140, 'data-ready wait', 'wait-label');
  for (const [id, [x, y]] of Object.entries(points)) {
    element('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 3, class: 'event-node' }, svg);
    text(svg, x, y - 3, labels[id][0], 'figure-label');
    text(svg, x, y + 17, labels[id][1]);
  }
}

function drawExecution(animate = false) {
  const host = get('execution-figure'), width = host.clientWidth;
  if (!width || !trace) return;
  if (frame !== null) cancelAnimationFrame(frame);
  const narrow = width < 480, left = narrow ? 78 : 124, right = 18;
  const capacity = Math.min(trace.length, Math.max(4, Math.floor((width - left - right) / 37)));
  const start = Math.min(Math.max(0, position - 2), trace.length - capacity);
  const visible = trace.slice(start, start + capacity);
  const pitch = (width - left - right) / capacity;
  const xFor = i => left + pitch * (i + .5);
  const yFor = lane => 47 + lane * 67;
  const svg = canvas(host, width, 342, `Execution prefix: ${position} of ${trace.length} events completed. Four lanes distinguish producer, copy engine, consumer, and compute engine.`, 'execution');
  const lanes = narrow ? ['Producer', 'Copy', 'Consumer', 'Compute'] : ['Producer', 'Copy engine', 'Consumer', 'Compute engine'];
  lanes.forEach((label, i) => {
    text(svg, left - 12, yFor(i) + 4, label, 'figure-secondary', 'end');
    element('line', { x1: left - 2, x2: width - 8, y1: yFor(i), y2: yFor(i), class: 'lane' }, svg);
  });
  const prefix = trace.slice(0, position), failed = violations(model, prefix);
  const failedIds = new Set(failed.flatMap(item => [item.from, item.to]));
  visible.forEach((event, i) => {
    const ordinal = start + i + 1, x = xFor(i), y = yFor(event.lane);
    const group = element('g', { 'data-event-id': event.id, 'data-position': ordinal }, svg);
    element('title', {}, group).textContent = `${ordinal}. ${event.label}`;
    let cls = 'event-dot';
    if (ordinal <= position) cls += ' event-done';
    if (ordinal === position) cls += ' event-current';
    if (ordinal <= position && failedIds.has(event.id)) cls += ' event-failed';
    if (ordinal > position) group.setAttribute('class', 'event-future');
    element('circle', { cx: x, cy: y, r: 8, class: cls }, group);
    text(group, x, y + 26, event.id);
    text(svg, x, 296, String(ordinal), 'figure-secondary');
  });
  const guideX = position <= start ? left : xFor(Math.min(capacity - 1, position - start - 1));
  const guide = element('line', { x1: guideX, x2: guideX, y1: 18, y2: 265, class: 'position-guide' }, svg);
  text(svg, width / 2, 329, `Execution positions ${start + 1}–${start + capacity} of ${trace.length}`, 'figure-secondary');
  if (animate && previousGuide && previousGuide.start === start && !motion.matches) {
    const old = previousGuide.x, begin = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - begin) / 220), eased = 1 - (1 - t) ** 3;
      const x = old + (guideX - old) * eased;
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  previousGuide = { x: guideX, start };
}

function eventDescription(event, prefix) {
  if (!event) return 'No events have completed. Advance through a prefix of the selected execution.';
  const tile = event.tile, slot = event.slot;
  if (event.kind === 'I') return `${event.id}: The producer issues the copy of tile ${tile} into slot ${slot}. Issue alone does not write the slot.`;
  if (event.kind === 'W') return `${event.id}: The copy engine writes tile ${tile} into slot ${slot}. This is the example’s actual memory effect.`;
  if (event.kind === 'J') return `${event.id}: The consumer issues computation for tile ${tile}. Its read and completion are separate events.`;
  if (event.kind === 'F') return `${event.id}: Computation for tile ${tile} finishes. Its shared read occurred at R${tile}.`;
  const content = slotsAfter(prefix.slice(0, -1))[slot];
  return `${event.id}: The compute engine reads slot ${slot} for tile ${tile}. ${content === null ? 'No modeled write to that slot has occurred.' : `The latest modeled write contains tile ${content}.`}`;
}

function renderPrefix(animate = false) {
  const prefix = trace.slice(0, position), failed = violations(model, prefix);
  get('execution-position').value = position;
  get('execution-count').textContent = `${position} / ${trace.length}`;
  get('execution-prev').disabled = position === 0;
  get('execution-next').disabled = position === trace.length;
  get('execution-event').textContent = eventDescription(prefix.at(-1), prefix);
  get('execution-check').dataset.result = failed.length ? 'violated' : 'clear';
  get('execution-check').textContent = failed.length
    ? `Ordering duty violated: ${failed[0].label}`
    : 'No declared ordering duty has been violated in this prefix. A prefix is not a proof about every execution.';
  const slots = get('slot-state'); slots.replaceChildren();
  slotsAfter(prefix).forEach((tile, i) => {
    const row = document.createElement('div'), label = document.createElement('strong');
    label.textContent = `Shared slot ${i}`; row.appendChild(label);
    row.appendChild(document.createTextNode(tile === null ? 'No write yet' : `Last modeled write: tile ${tile}`));
    slots.appendChild(row);
  });
  drawExecution(animate);
}

function chooseExecution() {
  const mode = get('example-execution').value;
  trace = mode === 'witness' ? result.witness.trace : execution(model, mode);
  position = 0; previousGuide = null;
  get('execution-position').max = trace.length;
  renderPrefix();
}

function chooseModel() {
  model = buildModel(Number(get('example-input').value), get('example-edit').value);
  result = analyze(model);
  const select = get('example-execution'); select.replaceChildren();
  const choices = [['copy-led', 'Copies advance first'], ['compute-led', 'Current computation advances first']];
  if (result.witness) choices.push(['witness', 'A contract-violating execution']);
  for (const [value, label] of choices) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option);
  }
  select.value = result.witness ? 'witness' : 'copy-led';
  const verdict = get('example-verdict');
  verdict.dataset.result = result.meetsContract ? 'satisfied' : 'violated';
  verdict.textContent = result.meetsContract
    ? `${model.tiles} tiles: every execution of this finite model satisfies the stated ordering duties.`
    : `${model.tiles} tiles: an allowed execution violates the stated ordering duties. ${result.missing[0].label}`;
  chooseExecution();
}

function renderMatrix() {
  const body = get('contract-matrix');
  for (const edit of edits) {
    const row = document.createElement('tr'), heading = document.createElement('th');
    heading.scope = 'row'; heading.textContent = edit.label; row.appendChild(heading);
    for (const tiles of [2, 3]) {
      const meets = analyze(buildModel(tiles, edit.id)).meetsContract;
      const cell = document.createElement('td'); cell.className = meets ? 'satisfied' : 'violated';
      cell.textContent = meets ? 'Satisfied' : 'Violated'; row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

get('example-input').addEventListener('change', chooseModel);
get('example-edit').addEventListener('change', chooseModel);
get('example-execution').addEventListener('change', chooseExecution);
get('execution-position').addEventListener('input', event => { position = Number(event.target.value); renderPrefix(); });
get('execution-prev').addEventListener('click', () => { position = Math.max(0, position - 1); renderPrefix(true); });
get('execution-next').addEventListener('click', () => { position = Math.min(trace.length, position + 1); renderPrefix(true); });
renderMatrix(); chooseModel(); drawDependencies();
const widths = new WeakMap();
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    if (widths.get(entry.target) === entry.contentRect.width) continue;
    widths.set(entry.target, entry.contentRect.width);
    if (entry.target.id === 'dependency-figure') drawDependencies();
    else { previousGuide = null; drawExecution(); }
  }
});
observer.observe(get('dependency-figure'));
observer.observe(get('execution-figure'));
// Keep the article reference explicit for browser diagnostics without globals.
article.dataset.exampleReady = 'true';
