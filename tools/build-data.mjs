// Reduces the NYC TLC yellow-taxi trips of one week (Mon 1 - Sun 7 January 2024)
// to the columns the demo uses, zstd-compressed. Every trip of that week is kept
// (nothing is sampled, nothing is cleaned: absurd distances and negative fares
// stay in, so profiling has something to find). The week is chosen so the whole
// set stays under the 1,000,000 rows the grid's `fullDataset` option will hold
// client-side. Dropped: the other columns, and the rows picked up outside the
// week. payment_type's code is spelled out as text; fare and tip are in dollars.
//
//   npm install --no-save @duckdb/node-api
//   curl -o data/raw/yellow_tripdata_2024-01.parquet \
//     https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
//   node tools/build-data.mjs
import { DuckDBInstance } from '@duckdb/node-api';

const SRC = 'data/raw/yellow_tripdata_2024-01.parquet';
const OUT = 'data/yellow-2024-01-week1.parquet';
const db = await (await DuckDBInstance.create(':memory:')).connect();
const one = async (sql) => (await db.runAndReadAll(sql)).getRowObjects()[0];

const raw = await one(`SELECT count(*) AS n FROM read_parquet('${SRC}')`);
// The raw file also carries a handful of rows stamped 2002, 2008 or 2023.
const WHERE = `tpep_pickup_datetime >= TIMESTAMP '2024-01-01' AND tpep_pickup_datetime < TIMESTAMP '2024-01-08'`;
await db.run(`COPY (
  SELECT tpep_pickup_datetime AS pickup,
         passenger_count::TINYINT AS passengers, round(trip_distance, 2)::DOUBLE AS trip_distance,
         PULocationID::SMALLINT AS pickup_zone,
         CASE payment_type WHEN 0 THEN 'Flex fare' WHEN 1 THEN 'Credit card' WHEN 2 THEN 'Cash'
              WHEN 3 THEN 'No charge' WHEN 4 THEN 'Dispute' ELSE 'Unknown' END AS payment,
         round(fare_amount, 2)::DOUBLE AS fare, round(tip_amount, 2)::DOUBLE AS tip
  FROM read_parquet('${SRC}') WHERE ${WHERE}
  ORDER BY tpep_pickup_datetime
) TO '${OUT}' (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 12, ROW_GROUP_SIZE 122880)`);
const out = await one(`SELECT count(*) AS n FROM read_parquet('${OUT}')`);
console.log(`raw rows ${raw.n}, kept ${out.n}, dropped ${Number(raw.n) - Number(out.n)} (outside 1-7 January 2024)`);
