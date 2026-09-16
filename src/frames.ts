import { DataFrame, Field, FieldType, createDataFrame } from '@grafana/data';

export interface ToFrameOptions {
  refId?: string;
  name?: string;
  /** Columns listed here come first, in this order. Everything else follows alphabetically. */
  order?: string[];
  /** Extra keys that should be treated as timestamps on top of the `*Time` heuristic. */
  timeFields?: string[];
  /** Keys that should never become a column. */
  exclude?: string[];
}

type Row = Record<string, unknown>;

const SECONDS_CUTOFF = 1e12;

/** Flattens one level of nested plain objects into `parent.child` keys. */
export function flattenRow(row: Row, prefix = ''): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(out, flattenRow(value as Row, name));
    } else {
      out[name] = value;
    }
  }
  return out;
}

function isTimeKey(key: string, timeFields: string[]): boolean {
  if (timeFields.includes(key)) {
    return true;
  }
  const leaf = key.split('.').pop()!;
  return /Time$/.test(leaf) || /Timestamp$/.test(leaf);
}

function firstDefined(rows: Row[], key: string): unknown {
  for (const row of rows) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function inferType(sample: unknown): FieldType {
  switch (typeof sample) {
    case 'number':
      return FieldType.number;
    case 'boolean':
      return FieldType.boolean;
    default:
      return FieldType.string;
  }
}

/** SEMP reports timestamps in whole seconds; Grafana wants epoch milliseconds. */
function normalizeTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) {
      return null;
    }
    return value < SECONDS_CUTOFF ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function coerce(value: unknown, type: FieldType): unknown {
  if (value === undefined) {
    return null;
  }
  if (type === FieldType.time) {
    return normalizeTime(value);
  }
  if (value === null) {
    return null;
  }
  if (type === FieldType.string && typeof value !== 'string') {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  if (type === FieldType.number && typeof value !== 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return value;
}

function orderKeys(keys: string[], order: string[]): string[] {
  const preferred = order.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !preferred.includes(key)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

/**
 * Turns an array of JSON objects (SEMP responses, browsed messages) into a
 * DataFrame, inferring field types from the data. Keeping this generic means the
 * plugin keeps working when a broker version adds or renames attributes.
 */
export function rowsToDataFrame(rows: Row[], opts: ToFrameOptions = {}): DataFrame {
  const { refId, name, order = [], timeFields = [], exclude = [] } = opts;
  const flat = rows.map((row) => flattenRow(row));

  const keySet = new Set<string>();
  for (const row of flat) {
    Object.keys(row).forEach((key) => keySet.add(key));
  }
  exclude.forEach((key) => keySet.delete(key));

  const keys = orderKeys([...keySet], order);

  const fields: Array<Partial<Field>> = keys.map((key) => {
    const type = isTimeKey(key, timeFields) ? FieldType.time : inferType(firstDefined(flat, key));
    return {
      name: key,
      type,
      values: flat.map((row) => coerce(row[key], type)),
    };
  });

  return createDataFrame({ refId, name, fields });
}

/** An empty frame that still advertises the columns a panel should expect. */
export function emptyDataFrame(columns: string[], opts: ToFrameOptions = {}): DataFrame {
  return createDataFrame({
    refId: opts.refId,
    name: opts.name,
    fields: columns.map((column) => ({
      name: column,
      type: isTimeKey(column, opts.timeFields ?? []) ? FieldType.time : FieldType.string,
      values: [],
    })),
  });
}
