import { decodePayload, toBase64, toBytes, toHex } from './payload';

const encode = (text: string) => new TextEncoder().encode(text);

describe('toBytes', () => {
  it('returns an empty array for null and undefined', () => {
    expect(toBytes(null)).toHaveLength(0);
    expect(toBytes(undefined)).toHaveLength(0);
  });

  it('reads a latin1 string byte by byte', () => {
    expect(Array.from(toBytes('\x00\xff\x41'))).toEqual([0, 255, 65]);
  });

  it('passes a Uint8Array through', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toBytes(bytes)).toBe(bytes);
  });
});

describe('toBase64 / toHex', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('base64-encodes %p', (input, expected) => {
    expect(toBase64(encode(input))).toBe(expected);
  });

  it('hex-encodes with padding', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
});

describe('decodePayload', () => {
  it('reports an empty payload', () => {
    const result = decodePayload(new Uint8Array(0));
    expect(result).toEqual({ text: '', encoding: 'empty', byteLength: 0, truncated: false });
  });

  it('pretty-prints JSON in auto mode', () => {
    const result = decodePayload(encode('{"a":1,"b":[2,3]}'));
    expect(result.encoding).toBe('json');
    expect(result.text).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it('falls back to text for non-JSON in auto mode', () => {
    const result = decodePayload(encode('hello wörld'));
    expect(result.encoding).toBe('text');
    expect(result.text).toBe('hello wörld');
    expect(result.byteLength).toBe(12);
  });

  it('falls back to base64 for invalid UTF-8 in auto mode', () => {
    const result = decodePayload(new Uint8Array([0xff, 0xfe, 0x00]));
    expect(result.encoding).toBe('base64');
    expect(result.text).toBe('//4A');
  });

  it('keeps malformed JSON as text when JSON is requested', () => {
    const result = decodePayload(encode('{not json'), 'json');
    expect(result.encoding).toBe('text');
    expect(result.text).toBe('{not json');
  });

  it('honours the explicit formats', () => {
    expect(decodePayload(encode('hi'), 'base64').text).toBe('aGk=');
    expect(decodePayload(encode('hi'), 'hex').text).toBe('6869');
    expect(decodePayload(encode('{"a":1}'), 'text').encoding).toBe('text');
  });

  it('truncates and flags long payloads', () => {
    const result = decodePayload(encode('abcdefghij'), 'text', 4);
    expect(result.text).toBe('abcd…');
    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBe(10);
  });

  it('does not truncate when maxChars is 0', () => {
    const result = decodePayload(encode('abcdefghij'), 'text', 0);
    expect(result.truncated).toBe(false);
    expect(result.text).toHaveLength(10);
  });
});
