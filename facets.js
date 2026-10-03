// Header-histogram counts for a pushdown grid. The grid does not hold the rows, so
// `facets.provider` asks DuckDB: one GROUP BY per column per filter state, over the
// filters the grid hands it (already without the column's own filter).
const DAY = 86400000;

/**
 * @param {{prepare: Function}} connection the engine's connection
 * @param {Record<string, 'numeric'|'category'|'date'>} kinds the histogram kind of each column
 * @returns {(request: object) => Promise<object>} a `facets.provider`
 */
export function facetProvider(connection, kinds) {
  const ranges = new Map();
  const kindFor = (c) => (c.type === 'datetime' ? { cast: 'TIMESTAMP', text: false } : { cast: null, text: null });
  const run = async (sql, params) => {
    const statement = await connection.prepare(sql);
    try { return (await statement.query(...params)).toArray(); } finally { statement.close(); }
  };
  const count = (rows) => new Map(rows.map((r) => [String(r.b), Number(r.n)]));

  return async ({ colId, filters, buckets }) => {
    const kind = kinds[colId];
    const params = [];
    const where = LatticeGrid.filtersToSql(filters, params, kindFor);
    const and = where ? `AND ${where}` : '';
    if (kind === 'category') {
      const all = await run(`SELECT ${colId} AS b, count(*) AS n FROM trips GROUP BY b ORDER BY n DESC`, []);
      const now = count(await run(`SELECT ${colId} AS b, count(*) AS n FROM trips WHERE true ${and} GROUP BY b`, params));
      return {
        bounds: { kind: 'category', buckets: all.map((r) => ({ value: r.b })), cardinality: all.length },
        counts: all.map((r) => now.get(String(r.b)) || 0), unfiltered: all.map((r) => Number(r.n)),
      };
    }
    const date = kind === 'date';
    const x = date ? `epoch_ms(${colId})` : colId;
    // The bars span the 0.5th-99.5th percentile, so one absurd fare or distance does not flatten the rest.
    if (!ranges.has(colId)) {
      const [r] = await run(`SELECT approx_quantile(${x}, 0.005)::DOUBLE AS lo, approx_quantile(${x}, 0.995)::DOUBLE AS hi FROM trips`, []);
      const [lo, hi] = [Number(r.lo), Number(r.hi)];
      ranges.set(colId, date ? [Math.floor(lo / DAY) * DAY, Math.ceil(hi / DAY) * DAY] : [lo, Math.max(hi, lo + 1)]);
    }
    const [lo, hi] = ranges.get(colId);
    const n = date ? Math.round((hi - lo) / DAY) : buckets;
    const w = (hi - lo) / n;
    const sql = (extra) => `SELECT least(floor((${x} - ${lo}) / ${w}), ${n - 1})::INT AS b, count(*) AS n FROM trips
      WHERE ${x} BETWEEN ${lo} AND ${hi} ${extra} GROUP BY b`;
    const now = count(await run(sql(and), params));
    const all = count(await run(sql(''), []));
    const edges = Array.from({ length: n }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w }));
    return {
      bounds: { kind: date ? 'date' : 'numeric', buckets: edges, min: lo, max: hi, ...(date && { granularity: 'day' }) },
      counts: edges.map((_, i) => now.get(String(i)) || 0), unfiltered: edges.map((_, i) => all.get(String(i)) || 0),
    };
  };
}
