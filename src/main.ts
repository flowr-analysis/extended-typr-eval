import fs from 'fs/promises';
import path from 'path';

import { AbstractFlowr } from './abstract_flowr';

async function main(folder: string) {
   const directory = path.resolve(folder);
   let flowr = new AbstractFlowr(directory);
   try {
      for (const file of await fs.readdir(directory)) {
         console.log("=>", file);
         let query: { type: string, criteria: string[] } = { type: 'datatype', criteria: [] };
         let typenames: Map<string, string> = new Map();
         const contents = await fs.readFile(path.join(directory, file), { encoding: 'utf-8' });
         const lines = contents.split('\n');
         for (let line = 0; line < lines.length; line++) {
            const parts = lines[line].trim().split(' ');
            if (parts.length == 2 && parts[1].startsWith('#type=') && parts[1].endsWith('#')) {
               const varname = parts[0];
               const typename = parts[1].substring(6, parts[1].length - 1);
               const criterion = `${line+1}@${varname}`;
               query.criteria.push(criterion);
               typenames.set(criterion, typename);
            }
         }
         let [results, resultString] = await flowr.query(file, [query]);
         const inferredTypes = new Map();
         for (const [criterion, typename] of typenames) {
            const resultType = results.datatype?.inferredTypes?.[criterion];
            inferredTypes.set(typename, resultType);
         }
         console.log(inferredTypes);
         console.log(resultString);
      }
   } finally {
      flowr.close();
   }
}
if(process.argv.length < 3) {
   console.error('Usage: `ts-node src/main.ts <folder>`, where `<folder>` is usually `eval`');
   process.exit(1);
}

const folder = process.argv[2];

void main(folder).catch(err => {
   console.error('Error during eval:', err);
   process.exit(1);
});
