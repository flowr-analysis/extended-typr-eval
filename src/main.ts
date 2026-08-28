import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process'
// import { FlowrAnalyzerBuilder } from '@eagleoutice/flowr/project/flowr-analyzer-builder';
// import { jsonReplacer } from '@eagleoutice/flowr/util/json';
// import { fileProtocol } from '@eagleoutice/flowr/r-bridge/retriever.js';
// import { log, LogLevel } from '@eagleoutice/flowr/util/log';

import { query } from './query';
import { arrayBuffer } from 'stream/consumers';

async function main(folder: string, outputFile: string) {
   // log.updateSettings(s => {
   //    s.settings.minLevel = LogLevel.Fatal;
   // });

   // const analyzer = await new FlowrAnalyzerBuilder()
   //    .setEngine('tree-sitter')
   //    .build();
   // analyzer.addRequest(fileProtocol + folder);
   try {
      const file = "test.R";
      const target = folder.startsWith('/') ? path.join(folder, file) : path.join("..", folder, file);
      const query_string = JSON.stringify(query).replaceAll('"', '\\"');
      const process = spawn(
         'npm',
         ['run', 'main', '--', '--execute', `:query* "${query_string}" "file://${target}"`],
         { 'cwd': './flowr/', stdio: 'pipe' }
      );
      const resultBytes = await arrayBuffer(process.stdout);
      await new Promise((resolve, reject) => {
         process.on('exit', (d) => resolve(d));
         process.on('error', (d) => reject(d));
      });
      const resultString = new TextDecoder().decode(resultBytes);
      const results = JSON.parse(resultString);
      // const results = await analyzer.query(query);
      // const resultString = JSON.stringify(results, jsonReplacer, 2);
      fs.writeFileSync(outputFile, resultString, 'utf-8');
      console.log(`Results written to ${outputFile} 
   * ${Object.entries(results).length} results (serialized: ${resultString.length} chars)`);
   } finally {
      // analyzer.close();
   }
}
if(process.argv.length < 4) {
   console.error('Usage: ts-node src/main.ts <folder> <output-file>');
   process.exit(1);
}

const folder = process.argv[2];
const outputFile = process.argv[3];

void main(folder, outputFile).catch(err => {
   console.error('Error during analysis:', err);
   process.exit(1);
});
