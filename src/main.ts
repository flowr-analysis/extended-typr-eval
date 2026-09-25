import fs from 'fs/promises';
import path from 'path';

import { AbstractFlowr } from './abstract_flowr';
import { DataType, DataTypeTag } from '@eagleoutice/flowr/typing/types';
import { EvalData, EvalDataForFile } from './database';
import { SlicingCriterion } from '@eagleoutice/flowr';
import { DatatypeQuery } from '@eagleoutice/flowr/queries/catalog/datatype-query/datatype-query-format';
import { TypeInferenceAccuracyCategory } from './analysis';
import { prettyPrintDataType } from '@eagleoutice/flowr/typing/pretty-print';
import { jsonReplacer } from './json';
import readline from 'readline/promises';

/**
* EXECS_PER_FILE > 1 increases performance measurement accuracy by
* running the analysis multiple times. EXECS_PER_FILE must be >= 1.
**/
const EXECS_PER_FILE = 3;

if(process.argv.length < 3) {
	console.error(`
Usage: \`npm run main -- <folder> [database] [comment]\`
       \`npm run main -- -e <database>\` (run eval on database, calculates scores etc.)
       \`npm run main -- -t\` (turn stdin R script into a JSON type representation)

For every .R file in \`<folder>\`:
  Flowr will infer types via the \`datatype\` query for all
  lines which contain only a variable name followed by \`#type=<name>#\`.
  A mapping from \`<name>\` to the inferred type will be added to the database.
  The database also stores an id for runs of this program, the start time of
  each run, and timing information for the \`datatype\` query of every file.
\`<folder>\` is usually \`eval\`.
\`<database>\` is usually \`results.sqlite\`.
  The database will be created if it doesn't exist yet.
\`[comment]\` is optional and will be saved in the database,
  together with the time and date when the run was started.
  You can think of it like a commit message.
`);
  process.exit(1);
}

const FOLDER_ARG_INSPECT = "-e"; // pass this instead of a folder of R files to get eval data
const FOLDER_ARG_GENTYPE = "-t"; // pass this instead of a folder of R files to jsonify an inferred type
const folder = process.argv[2];
const database = new EvalData(
	process.argv[3] || "",
	process.argv[4] || "",
	folder.startsWith("-"),
);

async function main(folder: string) {
	if (folder === FOLDER_ARG_INSPECT) return await main_inspect();
	if (folder === FOLDER_ARG_GENTYPE) return await main_gentype();
	if (folder.startsWith("-")) return;
	const directory = path.resolve(folder);
	const flowr = await AbstractFlowr.new(directory);
	try {
		for (const file of await fs.readdir(directory)) {
			if (!(file.endsWith(".R") || file.endsWith(".r"))) continue;
			console.log("=>", file);
			const query: DatatypeQuery = { type: 'datatype', criteria: [] };
			const typenames: Map<SlicingCriterion, string> = new Map();
			const contents = await fs.readFile(path.join(directory, file), { encoding: 'utf-8' });
			let truths: Map<string, string> = new Map();
			try {
				const tru = await fs.readFile(path.join(directory, file+".truth"), { encoding: 'utf-8' });
				for (const line of tru.split("\n")) {
					if (line.trimStart().startsWith("#")) continue;
					let eq = line.indexOf("=");
					if (eq >= 0) {
						truths.set(line.substring(0, eq).trim(), line.substring(eq+1).trim());
					}
				}
			} catch (e) {}
			const lines = contents.split('\n');
			for (let line = 0; line < lines.length; line++) {
				const parts = lines[line].trim().split(' ');
				if (parts.length == 2 && parts[1].startsWith('#type=') && parts[1].endsWith('#')) {
					const varname = parts[0];
					const typename = parts[1].substring(6, parts[1].length - 1);
					const criterion: SlicingCriterion = `${line+1}@${varname}`;
					query.criteria?.push(criterion);
					typenames.set(criterion, typename);
				}
			}
			let db: null | EvalDataForFile = null;
			for (let execsCount = 0; execsCount < EXECS_PER_FILE; execsCount++) {
				const [results, _resultString] = await flowr.query(file, [query]);
				const milliseconds = results['.meta'].timing ;
				if (db) {
					db.addMeta({ ms: milliseconds });
					continue;
				}
				db = database.withFile(file,  { ms: milliseconds});
				const inferredTypes: Map<string, DataType> = new Map();
				if (results.datatype?.inferredTypes) {
					for (const [criterion, typename] of typenames) {
						const resultType = results.datatype.inferredTypes[criterion];
						inferredTypes.set(typename, resultType);
						db.insertType(typename, resultType);
						const truth = truths.get(typename);
						if (truth !== undefined) db.insertTruthJson(typename, truth);
					}
				}
			}
		}
	} catch {
		database.close();
		flowr.close();
	}
}

async function main_inspect() {
	const db = database.history();
	for (const run of db.runs()) {
		console.log(`\n===== Run #${run.id} =====\n`);
		for (const file of run.files()) {
			const an = file.analyse();
			// const expp = (d?: DataType | null) => d === undefined ? "(undefined)" : (d === null ? "(ignored)" : JSON.stringify(d, jsonReplacer));
			const pp = (d?: DataType | null) => d === undefined ? "(undefined)" : (d === null ? "(ignored)" : prettyPrintDataType(d));
			let totalScore = 0;
// types:${file.typesWithTruths().entries().map(([name, types]) =>
// 	`\n- name: ${name}\n  inferred: ${pp(types.inferred)}\n  expected: ${pp(types.expected)}\n  inferred: ${expp(types.inferred)}\n  expected: ${expp(types.expected)}`
// ).reduce((a, b) => a + b)}
			console.log(`--- ${file.file} ---
timings:
  ${Math.round(an.msAverage())} ms (mean), ${Math.round(an.msMedian())} ms (median) - ${an.runs()} runs
accuracy:${an.typeAccuracy().entries().map(([name, accuracy]) => {
	let desc; const prevScore = totalScore;
	switch (accuracy.cat) {
		case TypeInferenceAccuracyCategory.Ignore:
			return "";
		case TypeInferenceAccuracyCategory.Equal:
			totalScore += 5;
			desc = `inferred the expected type ${pp(accuracy.type)}`;
			break;
		case TypeInferenceAccuracyCategory.Supertype:
			if (accuracy.inferred.tag == DataTypeTag.Intersection && accuracy.inferred.types.size == 0) {
				totalScore += -1;
				desc = `inferred top (⊤) instead of the expected type ${pp(accuracy.expected)}`;
			} else {
				totalScore += 3;
				desc = `inferred the supertype ${pp(accuracy.inferred)} of the expected type ${pp(accuracy.expected)}`;
			}
			break;
		case TypeInferenceAccuracyCategory.Subtype:
			totalScore += -10;
			desc = `inferred the *subtype* ${pp(accuracy.inferred)} of the expected type ${pp(accuracy.expected)}`;
			break;
		case TypeInferenceAccuracyCategory.Unrelated:
			totalScore += -10;
			desc = `inferred the *unrelated* ${pp(accuracy.inferred)} instead of the expected type ${pp(accuracy.expected)}`;
			break;
		case TypeInferenceAccuracyCategory.NoInferredType:
			desc = `there was NO inferred type (bug?)`;
			break;
		case TypeInferenceAccuracyCategory.NoExpectedType:
			desc = `there was NO expected type (missing?)`;
			break;
	}
	let scoreDelta: number | string = totalScore-prevScore;
	if (scoreDelta >= 0) scoreDelta = "+" + scoreDelta;
	return `\n  ${name} (${scoreDelta}): ${desc}`;
}).reduce((a, b) => a + b)}
score:
  ${totalScore}
`);
		}
	}
}

async function main_gentype() {
	console.log("Enter R code, then press enter twice:");
	const lineReader = readline.createInterface({ input: process.stdin, output: process.stderr });
	const lines: string[] = [];
	await new Promise((r) => {
		lineReader.on('line', (line) => {
			if (line.length == 0) {
				lineReader.removeAllListeners();
				r(false);
			} else {
				lines.push(line.replaceAll(/[\r\n]/g, ""));
			}
		});
		lineReader.once('close', _ => {
			lineReader.removeAllListeners();
			r(true);
		});
	});
	console.log("Inferring type...");
	if (lines.length == 0) return;
	// assign last line to a variable name which no sane person would ever use,
	lines[lines.length-1] = "whcisjalhjyucwfcmscxhzssfbleesfw = " + lines[lines.length-1];
	// then query the type of that variable using flowr/typer
	const resultVar: SlicingCriterion = `${lines.length}@whcisjalhjyucwfcmscxhzssfbleesfw`;
	const query: DatatypeQuery = { type: 'datatype', criteria: [resultVar] };
	const flowr = await AbstractFlowr.new("");
	const [results, _resultString] = await flowr.queryLiteral(lines.join("\n"), [query]);
	const ty = results.datatype.inferredTypes[resultVar];
	console.log(prettyPrintDataType(ty));
	console.log(JSON.stringify(ty, jsonReplacer));
	lineReader.close();
}

void main(folder).catch(err => {
	console.error('Error during eval:', err);
	database.close();
	process.exit(1);
});
