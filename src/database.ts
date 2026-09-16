import { DataType } from '@eagleoutice/flowr/typing/types';
import Database from 'better-sqlite3'
import { jsonReplacer, jsonReviver } from './json';

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
	id: BigInt | null;
	constructor(path: string, comment: string, readonly?: boolean) {
		this.db = new Database(path || ":memory:");
		const tables = `runs(id INTEGER PRIMARY KEY, time STRING, comment STRING)
			meta(id INTEGER, file STRING, ms REAL, PRIMARY KEY (id, file))
			types(id INTEGER, file STRING, name STRING, json STRING, PRIMARY KEY (id, file, name))`;
		for (const t of tables.split('\n')) {
			this.db.exec(`CREATE TABLE IF NOT EXISTS ${t.trim()};`);
		}
		if (readonly) {
			this.id = null;
		} else {
			let { id } = this.db
				.prepare('INSERT INTO runs (time, comment) VALUES (?, ?) RETURNING id;')
				.get((new Date()).toISOString(), comment) as { id: BigInt };
			this.id = id;
		}
	}

	withFile(file: string, meta: { ms: number }): EvalDataForFile {
		if (this.id === null) throw Error("database opened as readonly");
		this.db
			.prepare('INSERT INTO meta (id, file, ms) VALUES (?, ?, ?)')
			.run(this.id, file, meta.ms);
		return new EvalDataForFile(this, file);
	}

	history(): EvalDataHistory {
		return new EvalDataHistory(this);
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
			.run(this.db.id, this.file, name, JSON.stringify(datatype, jsonReplacer));
	}
}

export class EvalDataHistory {
	db: EvalData;
	constructor(db: EvalData) {
		this.db = db;
	}

	runs(): EvalDataHistoryRun[] {
		return this.db.db.prepare("SELECT * FROM runs").all().flatMap(row => {
			if (row instanceof Object && 'id' in row && 'time' in row && typeof row['time'] == 'string') {
				const id = row['id'];
				const time = new Date(row['time']);
				if ((typeof id == 'number' || typeof id == 'bigint') && !isNaN(time.valueOf())) {
					return [new EvalDataHistoryRun(
						this.db,
						BigInt(id),
						time,
						('comment' in row && typeof row['comment'] == 'string') ? row['comment'] : null,
					)];
				}
			}
			console.log("Invalid database row in table `runs`:", row);
			return [];
		});
	}
}

export class EvalDataHistoryRun {
	db: EvalData;
	id: bigint;
	time: Date;
	comment: string | null;
	constructor(db: EvalData, id: bigint, time: Date, comment: string | null) {
		this.db = db;
		this.id = id;
		this.time = time;
		this.comment = comment;
	}

	files(): EvalDataHistoryFileInRun[] {
		return this.db.db.prepare("SELECT * FROM meta WHERE id = ?").all(this.id).flatMap(row => {
			if (row instanceof Object && 'file' in row && 'ms' in row) {
				const ms = row['ms'];
				if (typeof row['file'] == 'string' && typeof ms == 'number') {
					return [new EvalDataHistoryFileInRun(
						this.db,
						this.id,
						row['file'],
						ms,
					)];
				}
			}
			console.log("Invalid database row in table `meta`:", row);
			return [];
		});
	}
}

export class EvalDataHistoryFileInRun {
	db: EvalData;
	id: bigint;
	file: string;
	ms: number;
	constructor(db: EvalData, id: bigint, file: string, ms: number) {
		this.db = db;
		this.id = id;
		this.file = file;
		this.ms = ms;
	}

	types(): Map<string, DataType> {
		return new Map(this.db.db.prepare("SELECT name, json FROM types WHERE id = ? AND file = ?").all(this.id, this.file).flatMap(row => {
			if (row instanceof Object && 'name' in row && 'json' in row && typeof row['json'] == 'string') {
				const name = row['name'];
				// TODO: this is not type safe (???)
				try {
					const value: DataType = JSON.parse(row['json'], jsonReviver);
					if (typeof name == 'string') {
						return [[name, value]];
					}
				} catch {}
			}
			console.log("Invalid database row in table `types`:", row);
			return [];
		}));
	}
}
