import path from 'path';
import { spawn } from 'child_process'
import { arrayBuffer } from 'stream/consumers';
import { QueryResults, SupportedQueryTypes } from '@eagleoutice/flowr';
// import { FlowrAnalyzerBuilder } from '@eagleoutice/flowr/project/flowr-analyzer-builder';
// import { jsonReplacer } from '@eagleoutice/flowr/util/json';
// import { fileProtocol } from '@eagleoutice/flowr/r-bridge/retriever.js';
// import { log, LogLevel } from '@eagleoutice/flowr/util/log';

// export class AbstractFlowr {
// 	analyzer: FlowrAnalyzer;
// 	constructor(directory: string) {
// 		log.updateSettings(s => {
// 			s.settings.minLevel = LogLevel.Fatal;
// 		});
// 		this.analyzer = await new FlowrAnalyzerBuilder()
// 			.setEngine('tree-sitter')
// 			.build();
// 		this.analyzer.addRequest(fileProtocol + directory);
// 	}
// 	public async query(file: string, query: any): Promise<[Query, string]> {
// 		const results = await analyzer.query(query);
// 		const resultString = JSON.stringify(results, jsonReplacer, 2);
// 		return [results, resultString];
// 	}
// 	public async close(): Promise<void> {
// 		this.analyzer.close();
// 	}
// }

export class AbstractFlowr {
	directory: string;

	constructor(directory: string) {
		this.directory = directory;
	}

	public async query(file: string, query: any): Promise<[QueryResults<SupportedQueryTypes>, string]> {
		const target = path.join(this.directory, file);
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
		const results: QueryResults<SupportedQueryTypes> = JSON.parse(resultString);
		return [results, resultString];
	}

	public async close(): Promise<void> {}
}
