// One DuckDB-WASM engine (1.32.0, DuckDB 1.4) that reads the Parquet and hands
// the rows to the grid. The Parquet is a same-origin static file, fetched once.
const VERSION = '1.32.0';

/**
 * Start DuckDB-WASM, read the taxi Parquet and return its rows as plain objects.
 * `hour` and `passengers` are cast to zero-padded text so the grid draws them as
 * categorical histograms (24 and 10 exact bars) instead of bucketing integers.
 * @param {string} url the Parquet file's URL
 * @returns {Promise<{rows: object[], bytes: number, queryMs: number}>}
 */
export async function loadTrips(url) {
  const duckdb = await import(`https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${VERSION}/+esm`);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const connection = await db.connect();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const bytes = buffer.length;
  await db.registerFileBuffer('trips.parquet', buffer);
  const t0 = performance.now();
  const table = await connection.query(`SELECT row_number() OVER ()::INT AS id, epoch_ms(pickup)::DOUBLE AS pickup,
      lpad(hour(pickup)::VARCHAR, 2, '0') AS hour, payment, passengers::VARCHAR AS passengers,
      trip_distance, pickup_zone, fare, tip FROM read_parquet('trips.parquet')`);
  const rows = table.toArray().map((r) => r.toJSON());
  await connection.close();
  return { rows, bytes, queryMs: Math.round(performance.now() - t0) };
}
