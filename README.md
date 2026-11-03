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
  for which the type analysis should be evaluated,
  and `.R.truth` text files where each line is `type = <json>` or `type = ignore`.
  You can generate `<json>` using `-t` or by opening the database of previous runs.
- `<database>`:
  the path to an sqlite database file into which the
  evaluation results can be inserted.
- `<comment>`:
  an optional comment which will be inserted into the
  database with the other information.

If `<folder>` begins with a dash (`-`), special modes are used
instead of the program's normal behavior:

### Type-Infer Mode (`-t`)

Takes no additional arguments, just `-t`.
Reads an R script from stdin, then outputs the JSON representation
of the type of value produced by the last line, e.g. `0L` causes
this mode to output `{"tag":"RIntegerType"}`.
This JSON can be stored in the database's `truths` table as the expected value.

### Eval Mode (`-e`)

Called with `-e <database> [filter]`, this mode reads data for
all runs from the database, runs the evaluation based on the
content of `eval.json` and prints the data and eval results.

The optional `[filter]` is a space-separated list of keywords and filters.
Keywords start with the letters a-z or A-Z, filters start with a symbol.
Keywords always apply to the next filter. At the end of `[filter]`, keywords
apply to the general evaluation as opposed to a specific filter.

- To only print results of the nth analysis run,
  you can use the `#<n>` filter, where `<n>` is an integer `>= 0`.
- To only print results from the last analysis run,
  you can use the `last` keyword after the last filter.
- To only print results from analysis runs whose comments have a certain tag,
  you can use the `#<tag>` filter where `<tag>` is a nonempty consisting of `a-zA-Z0-9_`
  and containing at least one non-numeric symbol. The filter matches if the analysis run's
  comment includes `#<tag>` not followed by one of `a-zA-Z0-9_` (basically word-matching).
- For example, an interesting filter may be `last #typeR1 last #typeR2` to compare the
  final version of `typeR1` with the final (or most recent) version of `typeR2`,
  assuming the `#typeR1` and `#typeR2` tags were used in the comments of the analysis runs.

### Graph Mode (`-g`)

Called with `-g <database> [filter]`, like `-e`.
This mode runs the equivalent `-e` eval at least once,
using `graphs.json` as its config file and ignoring `eval.json`.

## Example


```R
# basic01.R
x <- 0L
x #type=int#
```

```text
# basic01.R.truth
int = {"tag":"RIntegerType"}
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

```text
# flow01.R.truth
# x = double ⋃ string, num = double, str = string
x = {"tag":"RTypeUnion","types":{"t":":!set","v":[{"tag":"RDoubleType"},{"tag":"RStringType"}]}}
num = {"tag":"RDoubleType"}
str = {"tag":"RStringType"}
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
sqlite> SELECT * FROM meta;
╭────┬───────────┬───────╮
│ id │   file    │  ms   │
╞════╪═══════════╪═══════╡
│  1 │ basic01.R │ 713.0 │
│  1 │ flow01.R  │ 595.0 │
│  2 │ basic01.R │ 694.0 │
│  2 │ flow01.R  │ 615.0 │
╰────┴───────────┴───────╯
sqlite> SELECT * FROM metas;
╭────┬───────────┬────────╮
│ id │   file    │   ms   │
╞════╪═══════════╪════════╡
│  1 │ basic01.R │  620.0 │
│  1 │ basic01.R │  644.0 │
│  1 │ flow01.R  │  604.0 │
│  1 │ flow01.R  │  597.0 │
│  2 │ basic01.R │  624.0 │
│  2 │ basic01.R │  609.0 │
│  2 │ flow01.R  │  609.0 │
│  2 │ flow01.R  │  597.0 │
╰────┴───────────┴────────╯
```
