import { DecodedPayload, decodePayload } from './payload';
import { PayloadFormat } from './types';

/**
 * The parts of `solace.Message` this plugin reads.
 *
 * Declared structurally rather than importing the class so the mapping can be
 * unit-tested with a stub, and so a broker/API version that drops a getter
 * degrades to a null column instead of throwing.
 */
export interface SolaceMessageLike {
  getReplicationGroupMessageId?(): unknown;
  getDestination?(): { name?: string } | null;
  getApplicationMessageId?(): string | null;
  getApplicationMessageType?(): string | null;
  getCorrelationId?(): string | null;
  getSenderId?(): string | null;
  getSenderTimestamp?(): number | null;
  getReceiverTimestamp?(): number | null;
  getSequenceNumber?(): number | null;
  getPriority?(): number | null;
  getDeliveryMode?(): unknown;
  getDeliveryCount?(): number | undefined;
  isRedelivered?(): boolean;
  isDMQEligible?(): boolean;
  getTimeToLive?(): number | null;
  getGMExpiration?(): number | undefined;
  getReplyTo?(): { name?: string } | null;
  getHttpContentType?(): string | null;
  getUserData?(): string | null;
  getSdtContainer?(): { getValue(): unknown } | null;
  getUserPropertyMap?(): SolaceUserPropertyMapLike | null;
  getBinaryAttachment?(): Uint8Array | string | null;
}

export interface SolaceUserPropertyMapLike {
  getKeys(): string[];
  getField(key: string): { getValue(): unknown } | null;
}

export interface BrowsedMessage {
  replicationGroupMsgId: string | null;
  destination: string | null;
  applicationMessageId: string | null;
  applicationMessageType: string | null;
  correlationId: string | null;
  senderId: string | null;
  senderTimestamp: number | null;
  receiverTimestamp: number | null;
  sequenceNumber: number | null;
  priority: number | null;
  deliveryMode: string | null;
  deliveryCount: number | null;
  redelivered: boolean | null;
  dmqEligible: boolean | null;
  timeToLive: number | null;
  expiration: number | null;
  replyTo: string | null;
  contentType: string | null;
  payloadBytes: number;
  payloadEncoding: DecodedPayload['encoding'];
  payloadTruncated: boolean;
  payload: string;
  userData: string | null;
  userProperties: Record<string, unknown>;
}

/** Column order for the resulting DataFrame. */
export const BROWSE_COLUMNS: Array<keyof BrowsedMessage> = [
  'senderTimestamp',
  'replicationGroupMsgId',
  'destination',
  'payload',
  'payloadBytes',
  'payloadEncoding',
  'applicationMessageId',
  'applicationMessageType',
  'correlationId',
  'priority',
  'redelivered',
  'deliveryCount',
];

/** Many solclientjs getters throw instead of returning null when a field is unset. */
export function safe<T>(read: (() => T) | undefined): Exclude<T, undefined> | null {
  if (typeof read !== 'function') {
    return null;
  }
  try {
    const value = read();
    return value === undefined ? null : (value as Exclude<T, undefined>);
  } catch {
    return null;
  }
}

export function asString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  if (typeof value === 'object') {
    const text = String(value);
    return text === '[object Object]' ? JSON.stringify(value) : text;
  }
  return JSON.stringify(value);
}

export function readUserProperties(message: SolaceMessageLike): Record<string, unknown> {
  const map = safe(message.getUserPropertyMap?.bind(message));
  if (!map) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const key of safe(map.getKeys.bind(map)) ?? []) {
    const field = safe(() => map.getField(key));
    const value = field ? safe(field.getValue.bind(field)) : null;
    result[key] = typeof value === 'object' && value !== null ? asString(value) : value;
  }
  return result;
}

function readPayload(message: SolaceMessageLike, format: PayloadFormat, maxChars: number): DecodedPayload {
  // Structured (SDT) messages carry their payload in a container rather than in
  // the binary attachment.
  const container = safe(message.getSdtContainer?.bind(message));
  if (container) {
    const value = safe(container.getValue.bind(container));
    if (value !== null) {
      const text = typeof value === 'string' ? value : (asString(value) ?? '');
      return decodePayload(new TextEncoder().encode(text), format, maxChars);
    }
  }
  return decodePayload(safe(message.getBinaryAttachment?.bind(message)), format, maxChars);
}

export function mapMessage(
  message: SolaceMessageLike,
  format: PayloadFormat = 'auto',
  maxChars = 4096
): BrowsedMessage {
  const payload = readPayload(message, format, maxChars);

  return {
    replicationGroupMsgId: asString(safe(message.getReplicationGroupMessageId?.bind(message))),
    destination: asString(safe(message.getDestination?.bind(message))?.name),
    applicationMessageId: safe(message.getApplicationMessageId?.bind(message)),
    applicationMessageType: safe(message.getApplicationMessageType?.bind(message)),
    correlationId: safe(message.getCorrelationId?.bind(message)),
    senderId: safe(message.getSenderId?.bind(message)),
    senderTimestamp: safe(message.getSenderTimestamp?.bind(message)),
    receiverTimestamp: safe(message.getReceiverTimestamp?.bind(message)),
    sequenceNumber: safe(message.getSequenceNumber?.bind(message)),
    priority: safe(message.getPriority?.bind(message)),
    deliveryMode: asString(safe(message.getDeliveryMode?.bind(message))),
    deliveryCount: safe(message.getDeliveryCount?.bind(message)),
    redelivered: safe(message.isRedelivered?.bind(message)),
    dmqEligible: safe(message.isDMQEligible?.bind(message)),
    timeToLive: safe(message.getTimeToLive?.bind(message)),
    expiration: safe(message.getGMExpiration?.bind(message)),
    replyTo: asString(safe(message.getReplyTo?.bind(message))?.name),
    contentType: safe(message.getHttpContentType?.bind(message)),
    payloadBytes: payload.byteLength,
    payloadEncoding: payload.encoding,
    payloadTruncated: payload.truncated,
    payload: payload.text,
    userData: asString(safe(message.getUserData?.bind(message))),
    userProperties: readUserProperties(message),
  };
}

/** Turns a browsed message into a flat row, optionally with one column per user property. */
export function flattenBrowsedMessage(
  message: BrowsedMessage,
  includeUserProperties: boolean
): Record<string, unknown> {
  const { userProperties, ...rest } = message;
  const row: Record<string, unknown> = { ...rest };

  if (includeUserProperties) {
    for (const [key, value] of Object.entries(userProperties)) {
      row[`prop.${key}`] = value;
    }
  }

  return row;
}
