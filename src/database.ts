import { DataType } from '@eagleoutice/flowr/typing/types';
import Database from 'better-sqlite3'

/**
* The database containing evaluation results of previous and current runs.
*
* The database has the following tables, all of which use the
* run id ("id") as the primary key or part of the primary key.
*
* - runs: contains the ids of all started runs. mostly used to assign a unique id to each run.
* - meta: maps id to run meta-information, namely the run's duration in milliseconds.
* - types: maps \[id, file name, type name] to a json string containing type information.
*/
export class EvalData {
	db: Database.Database;
	id: BigInt;
	constructor(path: string, comment: string) {
		this.db = new Database(path);
		const tables = `runs(id INTEGER PRIMARY KEY, time STRING, comment STRING)
			meta(id INTEGER, file STRING, ms REAL, PRIMARY KEY (id, file))
			types(id INTEGER, file STRING, name STRING, json STRING, PRIMARY KEY (id, file, name))`;
		for (const t of tables.split('\n')) {
			this.db.exec(`CREATE TABLE IF NOT EXISTS ${t.trim()};`);
		}
		let { id } = this.db
			.prepare('INSERT INTO runs (time, comment) VALUES (?, ?) RETURNING id;')
			.get((new Date()).toISOString(), comment) as { id: BigInt };
		this.id = id;
	}

	withFile(file: string, meta: { ms: number }): EvalDataForFile {
		this.db
			.prepare('INSERT INTO meta (id, file, ms) VALUES (?, ?, ?)')
			.run(this.id, file, meta.ms);
		return new EvalDataForFile(this, file);
	}

	close() {
		this.db.close();
	}
}

export class EvalDataForFile {
	db: EvalData;
	file: string;
	constructor(db: EvalData, file: string) {
		this.db = db;
		this.file = file;
	}

	insertType(name: string, datatype: DataType) {
		this.db.db
			.prepare('INSERT INTO types (id, file, name, json) VALUES (?, ?, ?, ?)')
			.run(this.db.id, this.file, name, JSON.stringify(datatype));
	}
}
