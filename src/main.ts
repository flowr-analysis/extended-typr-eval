import fs from 'fs/promises';
import path from 'path';

import { AbstractFlowr } from './abstract_flowr';
import { DataType } from '@eagleoutice/flowr/typing/types';
import { EvalData, EvalDataForFile } from './database';
import { SlicingCriterion } from '@eagleoutice/flowr';
import { DatatypeQuery } from '@eagleoutice/flowr/queries/catalog/datatype-query/datatype-query-format';
import { prettyPrintDataType } from '@eagleoutice/flowr/typing/pretty-print';
import { jsonReplacer } from './json';
import readline from 'readline/promises';
import { main_inspect } from './eval';

/**
* EXECS_PER_FILE > 1 increases performance measurement accuracy by
* running the analysis multiple times. EXECS_PER_FILE must be >= 1.
*/
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
const argv = process.argv;
export const arg_folder = process.argv[2];
export const arg_path = process.argv[3];
export const arg_comment = process.argv[4];
for (let i = 3; i < argv.length; i++) {
	if (argv[i].startsWith("-")) {
		switch (argv[i]) {
			case "--scores":
				break;
		}
	}
}
const database = new EvalData(
	arg_path || "",
	arg_comment || "",
	arg_folder.startsWith("-"),
);

async function main(folder: string) {
	if (folder === FOLDER_ARG_INSPECT) return await main_inspect(database);
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
	} catch (e) {
		console.log(e);
		database.close();
		flowr.close();
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

void main(arg_folder).catch(err => {
	console.error('Error during eval:', err);
	database.close();
	process.exit(1);
});
