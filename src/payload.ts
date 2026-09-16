import { PayloadFormat } from './types';

export type PayloadEncoding = 'empty' | 'text' | 'json' | 'base64' | 'hex';

export interface DecodedPayload {
  text: string;
  encoding: PayloadEncoding;
  byteLength: number;
  truncated: boolean;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The Solace JS API hands back either a Uint8Array or a binary ("latin1")
 * string, depending on message type and API version. Normalize both.
 */
export function toBytes(raw: Uint8Array | string | null | undefined): Uint8Array {
  if (raw == null) {
    return new Uint8Array(0);
  }
  if (typeof raw === 'string') {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i) & 0xff;
    }
    return bytes;
  }
  return raw;
}

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/** Strict UTF-8 decode; returns undefined for anything that is not valid UTF-8. */
function decodeUtf8Strict(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function decodeUtf8Lossy(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function prettyJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return undefined;
  }
}

function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (!maxChars || maxChars <= 0 || text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: `${text.slice(0, maxChars)}…`, truncated: true };
}

/**
 * Renders a message payload for display in a table panel.
 *
 * `auto` prefers pretty-printed JSON, falls back to UTF-8 text and finally to
 * base64 for anything binary, so a queue mixing formats still renders.
 */
export function decodePayload(
  raw: Uint8Array | string | null | undefined,
  format: PayloadFormat = 'auto',
  maxChars = 4096
): DecodedPayload {
  const bytes = toBytes(raw);
  const byteLength = bytes.length;

  if (byteLength === 0) {
    return { text: '', encoding: 'empty', byteLength: 0, truncated: false };
  }

  const finish = (text: string, encoding: PayloadEncoding): DecodedPayload => {
    const { text: cut, truncated } = truncate(text, maxChars);
    return { text: cut, encoding, byteLength, truncated };
  };

  if (format === 'base64') {
    return finish(toBase64(bytes), 'base64');
  }
  if (format === 'hex') {
    return finish(toHex(bytes), 'hex');
  }
  if (format === 'text') {
    return finish(decodeUtf8Lossy(bytes), 'text');
  }
  if (format === 'json') {
    const text = decodeUtf8Lossy(bytes);
    const pretty = prettyJson(text);
    return pretty === undefined ? finish(text, 'text') : finish(pretty, 'json');
  }

  // auto
  const utf8 = decodeUtf8Strict(bytes);
  if (utf8 === undefined) {
    return finish(toBase64(bytes), 'base64');
  }
  const pretty = prettyJson(utf8);
  return pretty === undefined ? finish(utf8, 'text') : finish(pretty, 'json');
}
