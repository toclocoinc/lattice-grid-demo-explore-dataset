# Explore a dataset you have never seen, in the browser

A [Lattice Grid](https://latticegrid.dev) demo: a month of New York yellow-taxi
trips (2,964,606 rows) loaded into DuckDB-WASM in a Web Worker in this tab, with
the grid on a DuckDB pushdown source (`duckdbAdapter` + `createPushdownSource`):
filters, pivot, the statistics panel's figures and the header histograms are all
SQL run by DuckDB, over rows the grid never holds. Nothing is uploaded.

- Every column header carries a **histogram** of its distribution. Click a bar
  to filter to it; drag across several. The 11:00 bar of the hour histogram, for
  example, narrows 2,964,606 trips to 150,542. The histogram counts come from
  `facets.js`, a `facets.provider` that asks DuckDB.
- The **statistics panel** (right) profiles one column over the rows the
  filters leave (`grid.statistics.profileAsync`, answered by DuckDB): count,
  distinct, min, max, mean, quartiles, median, standard deviation. It opens on
  Miles, where it shows a maximum of 312,722 miles in a month of city taxi rides.
  Figures DuckDB's aggregates do not give (outliers, shape) are named as such.
- **Pivot: hour x payment type** groups by hour and pivots by payment type on the
  live grid (`columns.group` + `columns.pivot`), with a trip count and the
  average fare per cell: 24 rows.

Live (once published): https://toclocoinc.github.io/lattice-grid-demo-explore-dataset/

## Run locally

    python3 -m http.server      # then open http://localhost:8000/ (add ?theme=dark)

## Data

NYC Taxi & Limousine Commission, *Yellow Taxi Trip Records*, January 2024:
https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page . Published by the
TLC as open data for public use (NYC Open Data terms of use). The TLC's file is
49.96 MB and served without CORS headers, so a page cannot fetch it from its
source at runtime; a reduced file is committed instead (19.4 MB, under 25 MB).

`data/yellow-2024-01.parquet` is derived: all 2,964,606 January trips (18 rows
stamped outside the month dropped), eight columns, fare and tip in dollars,
payment type spelled out. Nothing is sampled or cleaned: absurd distances and
negative fares stay in so profiling has something to find. Reproduce:

    npm install --no-save @duckdb/node-api
    mkdir -p data/raw && curl -o data/raw/yellow_tripdata_2024-01.parquet \
      https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
    node tools/build-data.mjs

## Measured (headless Chrome, `tools/measure.mjs`, Lattice Grid 1.86.1)

    npm install --no-save puppeteer-core
    python3 -m http.server 8622 &  node tools/measure.mjs ./shots

2,964,606 rows ready in about 2.0 s (DuckDB engine from the CDN, Parquet fetched,
table built in about 1.1 s); header histograms on all 8 columns (31, 24, 5, 11,
20, 20, 20, 20 bars); the 11:00 click filters to 150,542 trips with the profile
following it (median miles 1.52, computed by the source); a pickup-day bar
filters to 105,012; the live pivot has 24 rows; 0 console errors, light and dark.

## Known limitations

- With the pivot on, the statistics panel (still open) has no figures, and the
  grid logs a one-time `[lattice]` warning that a pivoted pushdown grid keeps no
  leaf rows to profile.
- Until the filtered total settles, `grid.rows.matchCount()` reports the loaded
  window (100 to 200 rows), not the filtered total.

## Licence

Demo code: MIT, see [LICENSE](LICENSE). Lattice Grid is loaded from the CDN
under its own licence; this page uses the public-demo licence for github.io.
