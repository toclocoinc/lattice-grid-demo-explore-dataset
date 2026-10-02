// Wiring only. engine.js starts DuckDB-WASM and reads the Parquet; the grid, its
// header histograms, its column-statistics panel and its pivot are the library's.
import { loadTrips } from './engine.js?v=20261002a';

const el = (id) => document.getElementById(id);
const { createGrid } = LatticeGrid;
const fmt = (n) => n.toLocaleString('en-US');

// Histogram settings: the long-tailed columns bucket by quantile, so one absurd
// distance does not squash every other bar into the first.
const skewed = { facet: { strategy: 'quantile' } };
const COLUMNS = [
  { field: 'id', title: 'Trip #', type: 'number', layout: 90, total: 'count', facet: false },
  { field: 'pickup', title: 'Pickup', type: 'datetime', layout: 170, facet: true },
  { field: 'hour', title: 'Hour', layout: 80, facet: true },
  { field: 'payment', title: 'Payment', layout: 120, facet: true },
  { field: 'passengers', title: 'Passengers', layout: 100, facet: true },
  { field: 'trip_distance', title: 'Miles', type: 'number', format: { decimals: 2 }, ...skewed },
  { field: 'pickup_zone', title: 'Pickup zone', type: 'number', facet: true },
  { field: 'fare', title: 'Fare ($)', type: 'number', format: { decimals: 2 }, total: 'avg', ...skewed },
  { field: 'tip', title: 'Tip ($)', type: 'number', format: { decimals: 2 }, ...skewed },
];

/**
 * Build the grid over the rows, either as the trip list or pivoted (hour down, payment type across).
 * Pivoting is declared in the configuration and the grid rebuilt: toggling it on a live grid
 * with columns.group()/columns.pivot() leaves every raw trip under the groups (F-1622-1).
 * @param {object[]} rows the trips
 * @param {boolean} pivoted whether to start pivoted
 * @returns {object} the grid
 */
function build(rows, pivoted) {
  const columns = COLUMNS.map((c) => (!pivoted ? c
    : c.field === 'hour' ? { ...c, group: { enabled: true } }
      : c.field === 'payment' ? { ...c, pivot: { enabled: true } } : c));
  el('grid').textContent = '';
  const grid = createGrid(el('grid'), {
    rowKey: 'id', rows, columns, selection: 'single', facets: { enabled: true, height: 44 },
    pivot: { enabled: pivoted, maxColumns: 24 },
    toolPanel: { panels: ['statistics', 'columns', 'filters'], openPanel: 'statistics' },
  });
  grid.emit('column:profile:open', { colId: 'trip_distance' });
  return grid;
}

/** Load the data, build the grid with the statistics panel open and record the timings. */
async function main() {
  const t0 = performance.now();
  el('status').textContent = 'Starting DuckDB-WASM and reading the Parquet…';
  const { rows, bytes, queryMs } = await loadTrips('data/yellow-2024-01-week1.parquet?v=20261002a');
  const t1 = performance.now();
  let grid = build(rows, false);
  const gridMs = Math.round(performance.now() - t1);

  let pivoted = false;
  el('pivot').addEventListener('click', () => {
    pivoted = !pivoted;
    grid.destroy();
    grid = build(rows, pivoted);
    window.__demo.grid = grid;
    el('pivot').textContent = pivoted ? 'Back to trips' : 'Pivot: hour × payment type';
  });
  el('clear').addEventListener('click', () => grid.filters.clear());
  const totalMs = Math.round(performance.now() - t0);
  el('status').textContent = `${fmt(rows.length)} trips (${(bytes / 1e6).toFixed(1)} MB Parquet) ready in ${fmt(totalMs)} ms.`;
  window.__demo = { grid, rows: rows.length, timings: { totalMs, queryMs, gridMs, bytes } };
}
main().catch((error) => { console.error('[explore demo]', error); el('status').textContent = `Failed: ${error.message}`; });
