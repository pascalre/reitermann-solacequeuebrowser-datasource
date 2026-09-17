import { FieldType } from '@grafana/data';
import { emptyDataFrame, flattenRow, rowsToDataFrame } from './frames';

describe('flattenRow', () => {
  it('flattens nested objects with dotted keys', () => {
    expect(flattenRow({ a: 1, b: { c: 2, d: { e: 3 } } })).toEqual({ a: 1, 'b.c': 2, 'b.d.e': 3 });
  });

  it('leaves arrays alone', () => {
    expect(flattenRow({ a: [1, 2] })).toEqual({ a: [1, 2] });
  });
});

describe('rowsToDataFrame', () => {
  it('infers field types from the data', () => {
    const frame = rowsToDataFrame([{ name: 'q1', count: 3, durable: true }]);
    const types = Object.fromEntries(frame.fields.map((field) => [field.name, field.type]));
    expect(types).toEqual({ name: FieldType.string, count: FieldType.number, durable: FieldType.boolean });
  });

  it('converts epoch-second timestamps to milliseconds', () => {
    const frame = rowsToDataFrame([{ spooledTime: 1_700_000_000 }]);
    const field = frame.fields[0];
    expect(field.type).toBe(FieldType.time);
    expect(field.values[0]).toBe(1_700_000_000_000);
  });

  it('keeps millisecond timestamps as they are and nulls out zero', () => {
    const frame = rowsToDataFrame([{ expiryTime: 1_700_000_000_000 }, { expiryTime: 0 }]);
    expect(frame.fields[0].values).toEqual([1_700_000_000_000, null]);
  });

  it('unions the keys of heterogeneous rows and pads missing values', () => {
    const frame = rowsToDataFrame([{ a: 1 }, { b: 'x' }]);
    const byName = Object.fromEntries(frame.fields.map((field) => [field.name, field.values]));
    expect(byName).toEqual({ a: [1, null], b: [null, 'x'] });
  });

  it('puts the preferred columns first and sorts the rest', () => {
    const frame = rowsToDataFrame([{ zeta: 1, alpha: 2, queueName: 'q' }], { order: ['queueName'] });
    expect(frame.fields.map((field) => field.name)).toEqual(['queueName', 'alpha', 'zeta']);
  });

  it('stringifies values that do not match the inferred type', () => {
    const frame = rowsToDataFrame([{ value: 'text' }, { value: 42 }]);
    expect(frame.fields[0].type).toBe(FieldType.string);
    expect(frame.fields[0].values).toEqual(['text', '42']);
  });

  it('drops excluded keys', () => {
    const frame = rowsToDataFrame([{ keep: 1, drop: 2 }], { exclude: ['drop'] });
    expect(frame.fields.map((field) => field.name)).toEqual(['keep']);
  });
});

describe('emptyDataFrame', () => {
  it('advertises the columns without rows', () => {
    const frame = emptyDataFrame(['queueName', 'spooledTime']);
    expect(frame.length).toBe(0);
    expect(frame.fields.map((field) => [field.name, field.type])).toEqual([
      ['queueName', FieldType.string],
      ['spooledTime', FieldType.time],
    ]);
  });
});
