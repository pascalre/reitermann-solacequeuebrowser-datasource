import { asString, flattenBrowsedMessage, mapMessage, SolaceMessageLike } from './message';

const encode = (text: string) => new TextEncoder().encode(text);

function stubMessage(overrides: SolaceMessageLike = {}): SolaceMessageLike {
  return {
    getReplicationGroupMessageId: () => ({ toString: () => 'rmid1:0117b-a1b2c3d4e5f-00000000-00000001' }),
    getDestination: () => ({ name: 'demo/orders/1' }),
    getApplicationMessageId: () => 'seed-1',
    getApplicationMessageType: () => 'order',
    getCorrelationId: () => 'corr-1',
    getSenderId: () => 'client-1',
    getSenderTimestamp: () => 1_700_000_000_000,
    getReceiverTimestamp: () => 1_700_000_000_500,
    getSequenceNumber: () => 7,
    getPriority: () => 4,
    getDeliveryMode: () => 'PERSISTENT',
    getDeliveryCount: () => 1,
    isRedelivered: () => false,
    isDMQEligible: () => true,
    getTimeToLive: () => 0,
    getGMExpiration: () => 0,
    getReplyTo: () => ({ name: 'reply/topic' }),
    getHttpContentType: () => 'application/json',
    getUserData: () => null,
    getBinaryAttachment: () => encode('{"orderId":"ORD-1"}'),
    ...overrides,
  };
}

describe('mapMessage', () => {
  it('maps the documented message fields', () => {
    const result = mapMessage(stubMessage());

    expect(result).toMatchObject({
      replicationGroupMsgId: 'rmid1:0117b-a1b2c3d4e5f-00000000-00000001',
      destination: 'demo/orders/1',
      applicationMessageId: 'seed-1',
      applicationMessageType: 'order',
      correlationId: 'corr-1',
      senderId: 'client-1',
      senderTimestamp: 1_700_000_000_000,
      sequenceNumber: 7,
      priority: 4,
      deliveryMode: 'PERSISTENT',
      deliveryCount: 1,
      redelivered: false,
      dmqEligible: true,
      replyTo: 'reply/topic',
      contentType: 'application/json',
    });
  });

  it('decodes a JSON binary attachment', () => {
    const result = mapMessage(stubMessage());

    expect(result.payloadEncoding).toBe('json');
    expect(result.payload).toBe('{\n  "orderId": "ORD-1"\n}');
    expect(result.payloadBytes).toBe(19);
    expect(result.payloadTruncated).toBe(false);
  });

  it('prefers the SDT container over the binary attachment', () => {
    const result = mapMessage(
      stubMessage({
        getSdtContainer: () => ({ getValue: () => 'plain text body' }),
      })
    );

    expect(result.payload).toBe('plain text body');
    expect(result.payloadEncoding).toBe('text');
  });

  it('honours the payload format and truncation', () => {
    const result = mapMessage(stubMessage({ getBinaryAttachment: () => encode('abcdefghij') }), 'text', 4);

    expect(result.payload).toBe('abcd…');
    expect(result.payloadTruncated).toBe(true);
    expect(result.payloadBytes).toBe(10);
  });

  it('survives getters that throw', () => {
    const result = mapMessage(
      stubMessage({
        getCorrelationId: () => {
          throw new Error('not set');
        },
      })
    );

    expect(result.correlationId).toBeNull();
    expect(result.destination).toBe('demo/orders/1');
  });

  it('survives getters the API does not have at all', () => {
    const result = mapMessage({ getBinaryAttachment: () => encode('hi') });

    expect(result.payload).toBe('hi');
    expect(result.priority).toBeNull();
    expect(result.userProperties).toEqual({});
  });

  it('reads the user property map', () => {
    const values: Record<string, unknown> = { source: 'seed-script', batch: 3, flagged: true };
    const result = mapMessage(
      stubMessage({
        getUserPropertyMap: () => ({
          getKeys: () => Object.keys(values),
          getField: (key) => ({ getValue: () => values[key] }),
        }),
      })
    );

    expect(result.userProperties).toEqual({ source: 'seed-script', batch: 3, flagged: true });
  });

  it('stringifies object-valued user properties', () => {
    const result = mapMessage(
      stubMessage({
        getUserPropertyMap: () => ({
          getKeys: () => ['blob'],
          getField: () => ({ getValue: () => new Uint8Array([0xde, 0xad]) }),
        }),
      })
    );

    expect(result.userProperties.blob).toBe('0xdead');
  });
});

describe('flattenBrowsedMessage', () => {
  const message = mapMessage(
    stubMessage({
      getUserPropertyMap: () => ({
        getKeys: () => ['source'],
        getField: () => ({ getValue: () => 'seed-script' }),
      }),
    })
  );

  it('adds one prefixed column per user property', () => {
    const row = flattenBrowsedMessage(message, true);

    expect(row['prop.source']).toBe('seed-script');
    expect(row.userProperties).toBeUndefined();
  });

  it('drops the user properties when the option is off', () => {
    const row = flattenBrowsedMessage(message, false);

    expect(Object.keys(row).some((key) => key.startsWith('prop.'))).toBe(false);
  });
});

describe('asString', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['text', 'text'],
    [42, '42'],
    [true, 'true'],
  ])('converts %p to %p', (input, expected) => {
    expect(asString(input)).toBe(expected);
  });

  it('hex-encodes byte arrays', () => {
    expect(asString(new Uint8Array([1, 255]))).toBe('0x01ff');
  });

  it('JSON-encodes plain objects', () => {
    expect(asString({ a: 1 })).toBe('{"a":1}');
  });

  it('uses toString when an object provides one', () => {
    expect(asString({ toString: () => 'custom' })).toBe('custom');
  });
});
