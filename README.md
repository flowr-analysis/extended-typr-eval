# extended-typer-eval

Runs type inference (via a `datatype` query to [`flowr`](https://github.com/flowr-analysis/flowr))
on a number of `.R` scripts, then saves timing information and the inferred types to a database.

## Setup

Typescript is required (`npm`, `ts-node`).

To depend on `flowr`, run `./import_flowr_local_branch.sh` in the repository's root.
This clones the `flowr` repo, builds `flowr`, and adds it as a local dependency.
You can re-run this script to update the `flowr` dependency.

NOTE: the flowr dependency doesn't really work right now, because we
depend on a branch which never made it into flowr's main branch.
The types it exports can be used, everything else is broken.
This will be fixed *eventually*.

## Usage

The help page can be displayed via `npm run main`.
The following arguments can be passed:

- `<folder>`:
  a folder containing `.R` scripts
  for which the type analysis should be evaluated.
- `<database>`:
  the path to an sqlite database file into which the
  evaluation results can be inserted.
- `<comment>`:
  an optional comment which will be inserted into the
  database with the other information.

## Example


```R
# basic01.R
x <- 0L
x #type=int#
```

```R
# flow01.R
if (0) { x <- 0 } else { x <- "" }
x #type=x#
if (is.numeric(x)) {
  x #type=num#
} else {
  x #type=str#
}
```

After two runs with these `.R` files,
using different versions of the type analysis,
the database might look like this:

```sql
sqlite> SELECT * FROM runs;
╭────┬──────────────────────────┬────────────╮
│ id │           time           │  comment   │
╞════╪══════════════════════════╪════════════╡
│  1 │ 2026-09-01T12:43:40.366Z │ first test │
│  2 │ 2026-09-01T12:47:16.059Z │ second run │
╰────┴──────────────────────────┴────────────╯
sqlite> SELECT * FROM meta;
╭────┬───────────┬───────╮
│ id │   file    │  ms   │
╞════╪═══════════╪═══════╡
│  1 │ basic01.R │ 721.0 │
│  1 │ flow01.R  │ 692.0 │
│  2 │ basic01.R │ 696.0 │
│  2 │ flow01.R  │ 727.0 │
╰────┴───────────┴───────╯
sqlite> SELECT * FROM types;
╭────┬───────────┬──────┬────────────────────────────────────────────────────────────────────────────╮
│ id │   file    │ name │                                    json                                    │
╞════╪═══════════╪══════╪════════════════════════════════════════════════════════════════════════════╡
│  1 │ basic01.R │ int  │ {"tag":"RIntegerType"}                                                     │
│  1 │ flow01.R  │ x    │ {"tag":"RTypeUnion","types":[{"tag":"RStringType"},{"tag":"RDoubleType"}]} │
│  1 │ flow01.R  │ num  │ {"tag":"RTypeUnion","types":[{"tag":"RStringType"},{"tag":"RDoubleType"}]} │
│  1 │ flow01.R  │ str  │ {"tag":"RTypeUnion","types":[{"tag":"RStringType"},{"tag":"RDoubleType"}]} │
│  2 │ basic01.R │ int  │ {"tag":"RIntegerType"}                                                     │
│  2 │ flow01.R  │ x    │ {"tag":"RTypeUnion","types":[{"tag":"RStringType"},{"tag":"RDoubleType"}]} │
│  2 │ flow01.R  │ num  │ {"tag":"RDoubleType"}                                                      │
│  2 │ flow01.R  │ str  │ {"tag":"RStringType"}                                                      │
╰────┴───────────┴──────┴────────────────────────────────────────────────────────────────────────────╯
```
