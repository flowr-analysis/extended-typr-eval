import fs from 'fs/promises';
import path from 'path';

import { AbstractFlowr } from './abstract_flowr';
import { DataType } from '@eagleoutice/flowr/typing/types';
import { SingleSlicingCriterion } from '@eagleoutice/flowr/slicing/criterion/parse';
import { EvalData } from './database';

if(process.argv.length < 4) {
	console.error(`
Usage: \`npm run main <folder> <database> [comment]\`

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

const folder = process.argv[2];
const database = new EvalData(
	process.argv[3],
	process.argv[4] || ""
);

async function main(folder: string) {
	const directory = path.resolve(folder);
	let flowr = new AbstractFlowr(directory);
	try {
		for (const file of await fs.readdir(directory)) {
			console.log("=>", file);
			let query: { type: string, criteria: string[] } = { type: 'datatype', criteria: [] };
			let typenames: Map<SingleSlicingCriterion, string> = new Map();
			const contents = await fs.readFile(path.join(directory, file), { encoding: 'utf-8' });
			const lines = contents.split('\n');
			for (let line = 0; line < lines.length; line++) {
				const parts = lines[line].trim().split(' ');
				if (parts.length == 2 && parts[1].startsWith('#type=') && parts[1].endsWith('#')) {
					const varname = parts[0];
					const typename = parts[1].substring(6, parts[1].length - 1);
					const criterion = `${line+1}@${varname}` as SingleSlicingCriterion;
					query.criteria.push(criterion);
					typenames.set(criterion, typename);
				}
			}
			let [results, resultString] = await flowr.query(file, [query]);
			const db = database.withFile(file,  { ms: results['.meta'].timing });
			const inferredTypes: Map<string, DataType> = new Map();
			if (results.datatype?.inferredTypes) {
				for (const [criterion, typename] of typenames) {
					const resultType = results.datatype.inferredTypes[criterion];
					inferredTypes.set(typename, resultType);
					db.insertType(typename, resultType);
				}
			}
			console.log(inferredTypes);
			console.log(resultString);
		}
	} finally {
		database.close();
		flowr.close();
	}
}

void main(folder).catch(err => {
	console.error('Error during eval:', err);
	database.close();
	process.exit(1);
});
