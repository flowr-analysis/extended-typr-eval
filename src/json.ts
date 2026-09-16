// JSON replacer and retriever to encode, in addition to
// already json-encodable structures, the following:
//
// - bigint
// - map
// - set
//
// Note that strings which start with `:` are given a special meaning,
// so jsonReplacer and jsonReviver must both be used when these may be at play,
// or not used at all (only using one of the two might produce incorrect results).
// The json replacer does the following:
//
// - Strings which start with a `:` are prefixed with another `:`.
// - Other strings remain unchanged.
// - BigInt values are stringified and prefixed with `:B`.
// - the following values are stored in an object `{ "t": ":!<type>", ... }`.
// - a Set has `<type> := set`, values are stored as `"v": [<value>, ...]`.
// - a Map has `<type> := map`, string keys are stored as `"v": { "<key>": <value>, ... }`
//   and other keys are stored as `"o": [[<key>, <value>], ...]`.

const JSON_RAW_T_SYMBOL = Symbol();

export function jsonReplacer(this: any, key: unknown, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(':')) {
    if (key === "t" && value.startsWith(':!') && this instanceof Object && Object.getOwnPropertyDescriptor(this, JSON_RAW_T_SYMBOL)?.value) {
      return value;
    }
    return `:${value}`;
  } else if(typeof value === 'bigint') {
    return `:B${value.toString()}`;
  } else if (value instanceof Set) {
    let obj = { "t": ":!set", "v": [...value] };
    Object.defineProperty(obj, JSON_RAW_T_SYMBOL, { value: true, enumerable: false });
    return obj;
  } else if (value instanceof Map) {
    const goodObjectKey = (k: any): boolean => typeof k === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(k);
    let obj;
    if (value.keys().every(k => goodObjectKey(k))) {
      obj = { "t": ":!map", "v": Object.fromEntries(value) };
    } else {
      let v: {[key:string]:any} = {};
      let o: any[] = [];
      for (const k of value.keys()) {
        if (typeof k == 'string' && goodObjectKey(k)) {
          v[k] = value.get(k);
        } else {
          o.push([k, value.get(k)]);
        }
      }
      obj = { "t": ":!map", "v": v, "o": o };
    }
    Object.defineProperty(obj, JSON_RAW_T_SYMBOL, { value: true, enumerable: false });
    return obj;
  } else {
    return value;
  }
}

export function jsonReviver(key: unknown, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(':') && !value.startsWith(':!')) {
    switch (value.substring(0, 2)) {
      case "::": {
        return value.substring(1);
      }
      case ":B": {
        try {
          return BigInt(value.substring(2));
        } catch {
          throw new SyntaxError("[custom json reviver] invalid `:B` bigint: " + value.substring(2));
        }
      }
      case ":!": {
        return value;
      }
      default: {
        throw new SyntaxError("[custom json reviver] invalid `:` string: " + value);
      }
    }
  } else if (value instanceof Object && 't' in value && typeof value.t === 'string' && value.t.startsWith(':!')) {
    switch (value.t.substring(2)) {
      case "set": {
        if ('v' in value && value.v instanceof Array) {
          return new Set(value.v);
        } else {
          throw new SyntaxError("[custom json reviver] invalid `:!set`");
        }
      }
      case "map": {
        if ('v' in value && value.v instanceof Object) {
          let map = new Map(Object.entries(value.v));
          if ('o' in value) {
            if (value.o instanceof Array) {
              for (const v of value.o) {
                if (v instanceof Array && v.length == 2) {
                  map.set(v[0], v[1]);
                } else {
                  throw new SyntaxError("[custom json reviver] invalid `:!map`");
                }
              }
            } else {
              throw new SyntaxError("[custom json reviver] invalid `:!map`");
            }
          }
          return map;
        } else {
          throw new SyntaxError("[custom json reviver] invalid `:!map`");
        }
      }
      default: {
        throw new SyntaxError("[custom json reviver] invalid `:!`: " + value.t);
      }
    }
  } else {
    return value;
  }
}

export function testJson() {
  const values: any[] = [
    1,
    BigInt("812093819023812093219"),
    "",
    ":test",
    ":!map",
    new Set(["a", ":!set", 1, 2, 3, new Map()]),
    new Map<any, any>([["a", 1], ["b", ":!set"], [":!map", 3]]),
    new Map<any, any>([["a", 1], ["2", 3], [2, 4], [{}, []]]),
  ];
  for (const original of values) {
    let str1 = JSON.stringify(original, jsonReplacer);
    let parsed = JSON.parse(str1, jsonReviver);
    let str2 = JSON.stringify(parsed, jsonReplacer);
    console.log(original, str1, parsed);
    if (str1 !== str2) {
      console.log(str1);
      console.log(str2);
      console.log();
    }
  }
}
