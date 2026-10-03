// One DuckDB-WASM engine (1.32.0, DuckDB 1.4). The Parquet is a same-origin static
// file, fetched once and loaded into the table `trips`; every query the grid makes
// after that runs in the Web Worker in this tab.
const VERSION = '1.32.0';

/**
 * Start DuckDB-WASM, load the taxi Parquet into `trips` and wrap the connection so
 * the page can show the last SQL statement the grid's adapter ran. `hour` and
 * `passengers` are zero-padded text so they draw as categorical histograms (24 and
 * 10 exact bars); `id` is a row number, the grid's row key.
 * @param {string} url the Parquet file's URL
 * @returns {Promise<{connection: object, lastSql: () => string, bytes: number, rows: number, loadMs: number}>}
 */
export async function startEngine(url) {
  const duckdb = await import(`https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${VERSION}/+esm`);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const raw = await db.connect();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const bytes = buffer.length;
  await db.registerFileBuffer('trips.parquet', buffer);
  const t0 = performance.now();
  await raw.query(`CREATE TABLE trips AS SELECT row_number() OVER ()::INT AS id, pickup,
      lpad(hour(pickup)::VARCHAR, 2, '0') AS hour, payment, passengers::VARCHAR AS passengers,
      trip_distance, pickup_zone, fare, tip FROM read_parquet('trips.parquet')`);
  const rows = Number((await raw.query('SELECT count(*) AS n FROM trips')).toArray()[0].n);
  const loadMs = Math.round(performance.now() - t0);

  let last = '';
  const display = (sql, params) => (params.length ? sql.replace(/\?/g, () => JSON.stringify(params.shift())) : sql);
  const connection = {
    query: (sql) => { last = sql; return raw.query(sql); },
    prepare: async (sql) => {
      const statement = await raw.prepare(sql);
      return {
        query: (...params) => { last = display(sql, params.slice()); return statement.query(...params); },
        close: () => statement.close(),
      };
    },
  };
  return { connection, lastSql: () => last, bytes, rows, loadMs };
}
