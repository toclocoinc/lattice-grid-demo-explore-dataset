// Wiring only. engine.js starts DuckDB-WASM and loads the Parquet, facets.js answers
// the header histograms from DuckDB. The grid, its pushdown source, its statistics
// panel and its pivot are the library's own.
import { startEngine } from './engine.js?v=20261003t';
import { facetProvider } from './facets.js?v=20261003t';

const el = (id) => document.getElementById(id);
const { createGrid, createPushdownSource, duckdbAdapter } = LatticeGrid;
const fmt = (n) => n.toLocaleString('en-US');

const COLUMNS = [
  { field: 'id', title: 'Trip #', type: 'number', layout: 90, total: 'count', facet: false },
  { field: 'pickup', title: 'Pickup', type: 'datetime', layout: 170, facet: true },
  { field: 'hour', title: 'Hour', layout: 80, facet: true },
  { field: 'payment', title: 'Payment', layout: 120, facet: true },
  { field: 'passengers', title: 'Passengers', layout: 100, facet: true },
  { field: 'trip_distance', title: 'Miles', type: 'number', format: { decimals: 2 }, facet: true },
  { field: 'pickup_zone', title: 'Pickup zone', type: 'number', facet: true },
  { field: 'fare', title: 'Fare ($)', type: 'number', format: { decimals: 2 }, total: 'avg', facet: true },
  { field: 'tip', title: 'Tip ($)', type: 'number', format: { decimals: 2 }, facet: true },
];
const KINDS = { pickup: 'date', hour: 'category', payment: 'category', passengers: 'category',
  trip_distance: 'numeric', pickup_zone: 'numeric', fare: 'numeric', tip: 'numeric' };

/** Load the data, build the grid with the statistics panel open and record the timings. */
async function main() {
  const t0 = performance.now();
  el('status').textContent = 'Starting DuckDB-WASM and loading the Parquet…';
  const engine = await startEngine('data/yellow-2024-01.parquet?v=20261003t');
  const adapter = duckdbAdapter({ connection: engine.connection, from: 'trips' });
  const source = createPushdownSource({ adapter, pageSize: 100, aggregates: { default: 'engine' } });
  const grid = createGrid(el('grid'), {
    rowKey: 'id', source, columns: COLUMNS, selection: 'single',
    facets: { enabled: true, height: 44, provider: facetProvider(engine.connection, KINDS) },
    toolPanel: { panels: ['statistics', 'columns', 'filters'], openPanel: 'statistics' },
  });
  await new Promise((resolve) => { const t = setInterval(() => { if (grid.rows.count() > 0) { clearInterval(t); resolve(); } }, 25); });
  grid.emit('column:profile:open', { colId: 'trip_distance' });

  let pivoted = false;
  el('pivot').addEventListener('click', () => {
    pivoted = !pivoted;
    grid.columns.group(pivoted ? ['hour'] : []);
    grid.columns.pivot(pivoted ? ['payment'] : []);
    el('pivot').textContent = pivoted ? 'Back to trips' : 'Pivot: hour × payment type';
  });
  el('clear').addEventListener('click', () => grid.filters.clear());
  const totalMs = Math.round(performance.now() - t0);
  el('status').textContent = `${fmt(engine.rows)} trips (${(engine.bytes / 1e6).toFixed(1)} MB Parquet) ready in ${fmt(totalMs)} ms.`;
  window.__demo = { grid, source, rows: engine.rows, timings: { totalMs, tableMs: engine.loadMs, bytes: engine.bytes } };
}
main().catch((error) => { console.error('[explore demo]', error); el('status').textContent = `Failed: ${error.message}`; });
