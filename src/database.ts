import { DataType } from '@eagleoutice/flowr/typing/types';
import Database from 'better-sqlite3'
import { jsonReplacer, jsonReviver } from './json';
import { DatabaseAnalyser } from './analysis';

/**
* The database containing evaluation results of previous and current runs.
*
* The database has the following tables, all of which use the
* run id ("id") as the primary key or part of the primary key.
*
* - runs: contains the ids of all started runs. mostly used to assign a unique id to each run.
* - meta: maps id to run meta-information, namely the first execution's duration in milliseconds.
* - metas: stores more meta-information for executions after the first one.
* - types: maps \[id, file name, type name] to a json string containing type information.
**/
export class EvalData {
	db: Database.Database;
	id: BigInt | null;
	constructor(path: string, comment: string, readonly?: boolean) {
		this.db = new Database(path || ":memory:");
		const tables = `runs(id INTEGER PRIMARY KEY, time STRING, comment STRING)
			meta(id INTEGER, file STRING, ms REAL, PRIMARY KEY (id, file))
			metas(id INTEGER, file STRING, ms REAL)
			types(id INTEGER, file STRING, name STRING, json STRING, PRIMARY KEY (id, file, name))
			truths(id INTEGER, file STRING, name STRING, json STRING, PRIMARY KEY (id, file, name))`;
		for (const t of tables.split('\n')) {
			this.db.exec(`CREATE TABLE IF NOT EXISTS ${t.trim()};`);
		}
		if (readonly) {
			this.id = null;
		} else {
			const { id } = this.db
				.prepare('INSERT INTO runs (time, comment) VALUES (?, ?) RETURNING id;')
				.get((new Date()).toISOString(), comment) as { id: BigInt };
			this.id = id;
		}
	}

	withFile(file: string, meta: { ms: number }): EvalDataForFile {
		if (this.id === null) throw Error("database opened as readonly");
		return new EvalDataForFile(this, file, meta);
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

	/** Adds an initial metadata, creating
	* a `meta` entry for the current run+file combination.
	**/
	constructor(db: EvalData, file: string, meta: { ms: number }) {
		this.db = db;
		this.file = file;
		this.db.db
			.prepare('INSERT INTO meta (id, file, ms) VALUES (?, ?, ?)')
			.run(this.db.id, file, meta.ms);
	}

	/**
	* Adds an additional metadata, for a second/third/... execution of
	* the same analysis. Useful mostly for performance measurements.
	**/
	addMeta(meta: { ms: number }) {
		this.db.db
			.prepare('INSERT INTO metas (id, file, ms) VALUES (?, ?, ?)')
			.run(this.db.id, this.file, meta.ms);
	}

	/**
	* Sets the type `name` to `datatype` for this run and this file.
	**/
	insertType(name: string, datatype: DataType) {
		this.db.db
			.prepare('INSERT INTO types (id, file, name, json) VALUES (?, ?, ?, ?)')
			.run(this.db.id, this.file, name, JSON.stringify(datatype, jsonReplacer));
	}
	/**
	* Sets the ground truth for type `name` to `datatype` for this run and this file.
	**/
	insertTruthJson(name: string, datatypeJson: string) {
		this.db.db
			.prepare('INSERT INTO truths (id, file, name, json) VALUES (?, ?, ?, ?)')
			.run(this.db.id, this.file, name, datatypeJson);
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

	analyse(): DatabaseAnalyser {
		return new DatabaseAnalyser(this);
	}

	types(): Map<string, DataType> {
		return new Map(this.db.db.prepare(`SELECT name, json FROM types WHERE id = ? AND file = ?`).all(this.id, this.file).flatMap(row => {
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
	/** returns `null` instead of a `DataType` when the value in the database is `ignore`. **/
	truths(): Map<string, DataType | null> {
		return new Map(this.db.db.prepare(`SELECT name, json FROM truths WHERE id = ? AND file = ?`).all(this.id, this.file).flatMap(row => {
			if (row instanceof Object && 'name' in row && 'json' in row && typeof row['json'] == 'string') {
				const name = row['name'];
				const json = row['json'];
				try {
					let value: DataType | null = null;
					if (json !== "ignore")
						value = JSON.parse(json, jsonReviver);
					if (typeof name == 'string') {
						return [[name, value]];
					}
				} catch {}
			}
			console.log("Invalid database row in table `truths`:", row);
			return [];
		}));
	}
	/**
	* Merges the results from `types()` and `truths()` to create a map
	* which has an entry for every name for which *at least one*
	* of `types()` and `truths()` has an entry.
	*
	* Other behaviors (name must be present in `types()`, in `truths()`, or in both)
	* can be achieved by looping over `types()` or `truths()`.
	**/
	typesWithTruths(): Map<string, { inferred?: DataType, expected?: DataType | null }> {
		const truths = this.truths();
		const both: Map<string, { inferred?: DataType, expected?: DataType | null }> = new Map();
		for (const [n, inferred] of this.types()) {
			both.set(n, { inferred: inferred, expected: truths.get(n) });
		}
		for (const [n, truth] of truths) {
			if (!both.has(n) && truth !== null && truth !== undefined) {
				both.set(n, { expected: truth });
			}
		}
		return both;
	}

	/**
	* Returns the duration, in milliseconds, of the first eval execution for this run and this file.
	* If you have an `EvalDataHistoryFileInRun` object, a first eval execution has been performed,
	* this this value is always a real measurement and guaranteed to exist.
	*
	* Measurements from additional executions can be retrieved with `msOther()`.
	**/
	msFirst(): number {
		return this.ms;
	}
	/**
	* Returns the durations, in milliseconds, of the eval execution for this run and this file, *skipping* the measurement returned by `msFirst()`.
	* The returned array may be empty. To include the `msFirst()` value, use `msAll()`.
	**/
	msOther(): number[] {
		const ms = [];
		for (const row of this.db.db.prepare("SELECT ms FROM metas WHERE id = ? AND file = ?").all(this.id, this.file)) {
			if (row instanceof Object && 'ms' in row && typeof row.ms == "number") {
				ms.push(row.ms);
			}
		}
		return ms;
	}
	/**
	* Returns the durations, in milliseconds, of the eval execution for this run and this file, *including* the measurement returned by `msFirst()`.
	* The returned array is never empty. To exclude the `msFirst()` value, use `msOther()`.
	**/
	msAll(): number[] {
		const ms = [this.ms];
		for (const row of this.db.db.prepare("SELECT ms FROM metas WHERE id = ? AND file = ?").all(this.id, this.file)) {
			if (row instanceof Object && 'ms' in row && typeof row.ms == "number") {
				ms.push(row.ms);
			}
		}
		return ms;
	}
}
