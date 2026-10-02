# Explore a dataset you have never seen, in the browser

A [Lattice Grid](https://latticegrid.dev) demo: one week of New York yellow-taxi
trips (609,698 rows), read from Parquet by DuckDB-WASM in a Web Worker in this
tab and handed to the grid. Nothing is uploaded.

- Every column header carries a **histogram** of its distribution. Click a bar
  to filter to it; drag across several. The hour bar for 11:00, for example,
  narrows 609,698 trips to 31,335.
- The **statistics panel** (right) profiles one column over the rows the filters
  leave: missing, distinct, quartiles, outliers, shape, distribution. It opens on
  Miles, where it shows a maximum of 59,280 miles in a week of city taxi rides.
- **Pivot: hour x payment type** turns the grid into 24 rows by payment type,
  with a trip count and the average fare in each cell.

Live (once published): https://toclocoinc.github.io/lattice-grid-demo-explore-dataset/

## Run locally

    python3 -m http.server      # then open http://localhost:8000/ (add ?theme=dark)

## Data

NYC Taxi & Limousine Commission, *Yellow Taxi Trip Records*, January 2024:
https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page . Published by the
TLC as open data for public use (NYC Open Data terms of use). The TLC's file is
served without CORS headers, so a page cannot fetch it from its source at
runtime; the reduced file is committed instead (4.1 MB, under the 25 MB limit).

`data/yellow-2024-01-week1.parquet` is derived: the trips picked up Mon 1 - Sun 7
January 2024 (609,698 of the month's 2,964,624), eight columns, fare and tip in
dollars, payment type spelled out. Nothing is sampled or cleaned: absurd
distances and negative fares stay in so profiling has something to find. The
week is chosen to stay a size a browser holds as plain rows. Reproduce:

    npm install --no-save @duckdb/node-api
    mkdir -p data/raw && curl -o data/raw/yellow_tripdata_2024-01.parquet \
      https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
    node tools/build-data.mjs

## Measured (headless Chrome, `tools/measure.mjs`)

    npm install --no-save puppeteer-core
    python3 -m http.server 8622 &  node tools/measure.mjs ./shots

On a shared, busy box: 609,698 rows ready in about 7.0 s (CDN fetch of the
DuckDB engine included, Parquet read and rows built in about 2.0 s, grid built in
about 4 s); a histogram-bar click filtered in about 0.66 s; 0 console errors in
light and dark.

## Known limitations

- Pivoting is declared in the grid configuration and the grid is rebuilt when
  you press the button. Toggling it on a live grid with `columns.group()` /
  `columns.pivot()` left every raw trip under each group (609,722 rows instead of 24).
- The console shows a one-time warning that `facet` is "not a configuration key"
  on a column; the key is documented and works.

## Licence

Demo code: MIT, see [LICENSE](LICENSE). Lattice Grid is loaded from the CDN
under its own licence; this page uses the public-demo licence for github.io.
