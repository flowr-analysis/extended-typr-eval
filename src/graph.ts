import { exit } from "process";
import { EvalData } from "./database";
import { main_evaluate } from "./eval";
import { pgfplot_blockbars } from "./plots";

async function evals_last_run(configs: object[], database: EvalData, filter: string): Promise<undefined | { errors: number, score: number, files: Map<string, { errors: number, score: number }> }[]> {
  const out = [];
  for (const config of configs) {
    let base = await main_evaluate(database, filter, config);
    if (base === undefined) return;
    let res: { errors: number, score: number, files: Map<string, { errors: number, score: number }> } | undefined = undefined;
    for (const val of base.values()) res = val;
    if (res === undefined) return;
    out.push(res);
  }
  return out;
}

async function evals_last_run_by_file(configs: object[], database: EvalData, filter: string): Promise<undefined | Map<string, { errors: number, score: number }[]>> {
  const evals = await evals_last_run(configs, database, filter);
  console.log(evals);
  if (evals === undefined) return;
  const files: Map<string, { errors: number, score: number }[]> = new Map();
  for (const e of evals) {
    for (const [name, file] of e.files.entries()) {
      if (!files.has(name)) {
        files.set(name, [file]);
      } else {
        let prev = files.get(name);
        if (prev === undefined) return;
        prev.push(file);
      }
    }
  }
  return files;
}

export async function main_graphs(database: EvalData, filter: string) {
  const configs = [
    // {
    //   "equal": 1,
    //   "supertype": 1,
    //   "toptype": 1,
    //   "unsound": 1,
    //   "exceptions": []
    // },
    {
      "equal": 1,
      "supertype": 0,
      "toptype": 0,
      "unsound": 0,
    },
    {
      "equal": 0,
      "supertype": 1,
      "toptype": 0,
      "unsound": 0,
    },
    {
      "equal": 0,
      "supertype": 0,
      "toptype": 1,
      "unsound": 0,
    },
    {
      "equal": 0,
      "supertype": 0,
      "toptype": 0,
      "unsound": 1,
    },
  ];
  let y = ["Accurate Types", "Supertypes", "Top Types", "Incorrect Types"];
  let ycolors = ["green", "blue", "yellow", "red"];
  const files = await evals_last_run_by_file(configs, database, filter);
  console.log(files);
  if (files === undefined) return;
  let x = new Array(...files.keys());
  let data = x.map(x => {
    let r = files.get(x);
    if (r === undefined) exit(1);
    return r.map(r => r.errors === 0 ? r.score : -r.errors);
  });
  console.log(pgfplot_blockbars(x, y, data, {
    colors: ycolors,
  }));
}
