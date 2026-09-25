import { EvalDataHistoryFileInRun } from "./database";
import { DataType } from "@eagleoutice/flowr/typing/types";
import { combine, subsumes } from "@eagleoutice/flowr/typing/subtyping/types";

export enum TypeInferenceAccuracyCategory {
  /** This type is inferred but its value should not be checked. May be useful when debugging. **/
  Ignore,
  /** The inferred type is the ground truth type. This is the desired outcome. **/
  Equal,
  /** The inferred type is a supertype of the ground truth type. The type inference system, in this case, was sound but not accurate. **/
  Supertype,
  /** The inferred type is a subtype of the ground truth type. The type inference system, in this case, was accurate but not sound. **/
  Subtype,
  /** The inferred type is not a sub- or supertype of the ground truth type. The type system was not accurate and not sound. **/
  Unrelated,
  /** When a ground truth type exists, but no type was inferred, not even `any`. **/
  NoInferredType,
  /** When a type was inferred, but no corresponding ground truth type exists. **/
  NoExpectedType,
}
export type TypeInferenceAccuracyMeasure = { cat: TypeInferenceAccuracyCategory.Ignore }
  | { cat: TypeInferenceAccuracyCategory.Equal, type: DataType }
  | { cat: TypeInferenceAccuracyCategory.Supertype, inferred: DataType, expected: DataType, unused: DataType }
  | { cat: TypeInferenceAccuracyCategory.Subtype, inferred: DataType, expected: DataType, missing: DataType }
  | { cat: TypeInferenceAccuracyCategory.Unrelated, inferred: DataType, expected: DataType }
  | { cat: TypeInferenceAccuracyCategory.NoInferredType }
  | { cat: TypeInferenceAccuracyCategory.NoExpectedType };

export class DatabaseAnalyser {
  db: EvalDataHistoryFileInRun;
  constructor(db: EvalDataHistoryFileInRun) {
    this.db = db;
  }

  runs(): number {
    return this.db.msAll().length;
  }
  /**
  * Returns the average (arithmetic mean) number of milliseconds
  * across all eval executions in this `EvalDataHistoryFileInRun`.
  **/
  msAverage(): number {
    let total = 0;
    const msAll = this.db.msAll();
    for (const ms of msAll) {
      total += ms;
    }
    return total / msAll.length;
  }
  /**
  * Returns the median (midpoint) number of milliseconds
  * across all eval executions in this `EvalDataHistoryFileInRun`.
  **/
  msMedian(): number {
    const msAll = this.db.msAll().toSorted();
    if (msAll.length % 2 == 0) {
      const mid = msAll.length / 2;
      return (msAll[mid-1] + msAll[mid]) / 2;
    } else {
      const mid = (msAll.length-1) / 2;
      return msAll[mid];
    }
  }

  typeAccuracy(): Map<string, TypeInferenceAccuracyMeasure> {
    const measures: Map<string, TypeInferenceAccuracyMeasure> = new Map();
    for (const [name, { inferred, expected }] of this.db.typesWithTruths()) {
      measures.set(name, this.typeAccuracyFor(inferred, expected));
    }
    return measures;
  }
  private typeAccuracyFor(inferred?: DataType, expected?: DataType | null): TypeInferenceAccuracyMeasure {
    if (expected === null) {
      return { cat: TypeInferenceAccuracyCategory.Ignore };
    } else if (inferred === undefined) {
      return { cat: TypeInferenceAccuracyCategory.NoInferredType };
    } else if (expected === undefined) {
      return { cat: TypeInferenceAccuracyCategory.NoExpectedType};
    } else {
      const subtype = subsumes(inferred, expected);
      const supertype = subsumes(expected, inferred);
      if (subtype && supertype) {
        return { cat: TypeInferenceAccuracyCategory.Equal, type: inferred };
      } else if (supertype) {
        // TODO: verify that `combine()` makes sense here
        return { cat: TypeInferenceAccuracyCategory.Supertype, inferred, expected, unused: combine(expected, inferred) };
      } else if (subtype) {
        // TODO: verify that `combine()` makes sense here
        return { cat: TypeInferenceAccuracyCategory.Subtype, inferred, expected, missing: combine(inferred, expected) };
      } else {
        return { cat: TypeInferenceAccuracyCategory.Unrelated, inferred, expected };
      }
    }
  }
}
