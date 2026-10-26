import fs from 'fs/promises';

import { subsumes } from "@eagleoutice/flowr/typing/subtyping/types";
import { DataType } from "@eagleoutice/flowr/typing/types";
import { TypeAccuracyError, TypeAccuracyErrorKind, TypeInferenceAccuracyCategory } from "./analysis";
import { EvalData } from "./database";
import { prettyPrintDataType } from "@eagleoutice/flowr/typing/pretty-print";
import { arg_comment } from "./main";
import { jsonReviver } from './json';

export class EvalRatingVector {
	public equal: number;
	public supertypeBase: number;
	public toptype: number;
	public unsound: number;
	exceptions: Map<[DataType, DataType], number>;
	constructor(equal: number, supertype: number, toptype: number, unsound: number) {
		this.equal = equal;
		this.supertypeBase = supertype;
		this.toptype = toptype;
		this.unsound = unsound;
		this.exceptions = new Map();
	}
	exception(inferred: DataType, expected: DataType, score: number) {
		this.exceptions.set([inferred, expected], score);
	}
	supertype(inferred: DataType, expected: DataType): number {
		// find the exception score in `this.exceptions`, using `Map.get`
		// and, if unsuccessful, by checking each exception individually
		// in case different `DataTypes` have the same set of values
		// (especially for `DataTypeTag.Variable`).
		let score = this.exceptions.get([inferred, expected]);
		if (score === undefined) {
			for (const [[inf, exp], sc] of this.exceptions.entries()) {
				if (subsumes(inf, inferred)
					&& subsumes(inferred, inf)
					&& subsumes(exp, expected)
					&& subsumes(expected, exp)) {
					score = sc;
				}
			}
		}
		if (score === undefined) {
			// no exception defined for this case, return default score
			return this.supertypeBase;
		} else {
			// exception defined and found, return its score
			return score;
		}
	}
}

export async function main_inspect(database: EvalData) {
	const db = database.history();
	const config = JSON.parse((await fs.readFile(arg_comment || "eval.json", { encoding: 'utf-8' })).trim());
	for (const v of [config.equal, config.supertype, config.toptype, config.unsound]) {
	  if (!(typeof v == "number")) {
	    console.log("CONFIG ERROR: fields `equal, supertype, toptype, unsound` must be numeric");
	    return;
	  }
	}
  const rating = new EvalRatingVector(config.equal, config.supertype, config.toptype, config.unsound);
  if (config.exceptions instanceof Array) {
    if (config.exceptions.every((v: any) => v instanceof Array && v.length == 3 && typeof v[0] == "string" && typeof v[1] == "string" && typeof v[2] == "number")) {
      for (const [inf, exp, sc] of config.exceptions) {
        // set the exception as defined in the config
        // TODO: there's no type checking for JSON.parse here :(
        rating.exception(
          JSON.parse(inf, jsonReviver),
          JSON.parse(exp, jsonReviver),
          sc,
        );
      }
    } else {
      console.log("CONFIG ERROR: field `exceptions` must be an array of 3-length arrays `[inferred: JSON(DataType), expected: JSON(DataType), score: number]`");
      return;
    }
  }
	for (const run of db.runs()) {
		console.log(`\n\n===== Run #${run.id} =====\n`);
		let totalRunErrors = 0;
		let totalRunScore = 0;
		for (const file of run.files()) {
			const an = file.analyse();
			// const expp = (d?: DataType | null) => d === undefined ? "(undefined)" : (d === null ? "(ignored)" : JSON.stringify(d, jsonReplacer));
			const pp = (d?: DataType | null) => d === undefined ? "(undefined)" : (d === null ? "(ignored)" : prettyPrintDataType(d));
			let totalScore = 0;
			const accuracy = an.typeAccuracy();
			let accuracyText;
			if (accuracy instanceof Map) {
				accuracyText = accuracy.entries().map(([name, accuracy]) => {
					let desc; const prevScore = totalScore;
					switch (accuracy.cat) {
						case TypeInferenceAccuracyCategory.Ignore:
							return "";
						case TypeInferenceAccuracyCategory.Equal:
							totalScore += rating.equal;
							desc = `inferred the expected type ${pp(accuracy.type)}`;
							break;
						case TypeInferenceAccuracyCategory.Supertype:
							totalScore += rating.supertype(accuracy.inferred, accuracy.expected);
							desc = `inferred the supertype ${pp(accuracy.inferred)} of the expected type ${pp(accuracy.expected)}`;
							break;
						case TypeInferenceAccuracyCategory.TopType:
							totalScore += rating.toptype;
							desc = `inferred the top type ${pp(accuracy.inferred)} instead of the expected type ${pp(accuracy.expected)}`;
							break;
						case TypeInferenceAccuracyCategory.Subtype:
							totalScore += rating.unsound;
							desc = `inferred the *subtype* ${pp(accuracy.inferred)} of the expected type ${pp(accuracy.expected)}`;
							break;
						case TypeInferenceAccuracyCategory.Unrelated:
							totalScore += rating.unsound;
							desc = `inferred the *unrelated* ${pp(accuracy.inferred)} instead of the expected type ${pp(accuracy.expected)}`;
							break;
						case TypeInferenceAccuracyCategory.NoInferredType:
							desc = `ERROR: there was NO inferred type (bug?)`;
							totalRunErrors += 1;
							break;
						case TypeInferenceAccuracyCategory.NoExpectedType:
							desc = `ERROR: there was NO expected type (missing?), but ${pp(accuracy.inferred)} was inferred`;
							totalRunErrors += 1;
							break;
					}
					let scoreDelta: number | string = totalScore - prevScore;
					if (scoreDelta >= 0) scoreDelta = "+" + scoreDelta;
					return `\n  ${name} (${scoreDelta}): ${desc}`;
				}).reduce((a, b) => a + b);
			} else {
				accuracyText = "\n  ERROR: ";
				totalRunErrors += 1;
				const err: TypeAccuracyError = accuracy;
				switch (err.kind) {
					case TypeAccuracyErrorKind.ExpectationFailed:
						accuracyText += `expected type ${pp(err.expected)}, but inferred ${pp(err.inferred)}`
						break;
				}
			}
// types:${file.typesWithTruths().entries().map(([name, types]) =>
// 	`\n- name: ${name}\n  inferred: ${pp(types.inferred)}\n  expected: ${pp(types.expected)}\n  inferred: ${expp(types.inferred)}\n  expected: ${expp(types.expected)}`
// ).reduce((a, b) => a + b)}
			console.log(`--- ${file.file} ---
timings:
  ${Math.round(an.msAverage())} ms (mean), ${Math.round(an.msMedian())} ms (median) - ${an.runs()} runs
accuracy:${accuracyText}
score:
  ${totalScore}
`);
			totalRunScore += totalScore;
		}
		if (totalRunErrors > 0) {
			console.log(`partial score: ${totalRunScore}`);
			console.log(`WARNING: There were ${totalRunErrors} errors in this run!`);
		} else {
			console.log(`final score: ${totalRunScore}`);
		}
	}
}
