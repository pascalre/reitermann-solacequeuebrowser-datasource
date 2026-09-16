import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

/** What a single query target asks the broker for. */
export enum SolaceQueryType {
  /** List the queues of a Message VPN (SEMP monitor). */
  Queues = 'queues',
  /** Detailed stats for one queue (SEMP monitor). */
  QueueStats = 'queueStats',
  /** Metadata of the messages spooled in a queue (SEMP monitor, no payload). */
  Messages = 'messages',
  /** Non-destructive browse of a queue via the Solace JS API (payload + headers). */
  MessagePayloads = 'messagePayloads',
}

export type PayloadFormat = 'auto' | 'text' | 'json' | 'base64' | 'hex';

export interface SolaceQuery extends DataQuery {
  queryType: SolaceQueryType;
  /** Overrides the Message VPN configured on the data source. */
  msgVpn?: string;
  /** Queue name — required for everything except `Queues`. */
  queueName?: string;
  /** SEMP `where=` expression, e.g. `queueName==order*`. Only for `Queues`. */
  where?: string;
  /** Maximum number of rows / messages to fetch. */
  limit?: number;
  /** How to render the binary attachment. Only for `MessagePayloads`. */
  payloadFormat?: PayloadFormat;
  /** Add one column per user property found on the browsed messages. */
  includeUserProperties?: boolean;
  /** Truncate payloads to this many characters (0 = no limit). */
  maxPayloadChars?: number;
}

export const DEFAULT_QUERY: Partial<SolaceQuery> = {
  queryType: SolaceQueryType.Queues,
  limit: 100,
  payloadFormat: 'auto',
  includeUserProperties: true,
  maxPayloadChars: 4096,
};

/**
 * Non-secret data source configuration.
 *
 * NOTE: everything in here is readable by any Grafana user who can read the
 * data source. The SEMP password is *not* here — it lives in secureJsonData and
 * is injected server-side by the Grafana data source proxy. The messaging
 * password unfortunately has to be here, because the Solace JS API runs in the
 * browser (see ConfigEditor for the warning shown to the user).
 */
export interface SolaceDataSourceOptions extends DataSourceJsonData {
  /** Default Message VPN used when a query does not override it. */
  msgVpn?: string;

  /** Enable the Solace JS API browse (needed for payloads). */
  messagingEnabled?: boolean;
  /** Web Messaging endpoint reachable from the *browser*, e.g. ws://localhost:8008. */
  webMessagingUrl?: string;
  /** Client username for the messaging connection. */
  messagingUserName?: string;
  /** Client password — stored in plain jsonData, see note above. */
  messagingPassword?: string;
  /** Give up browsing after this long without a new message (ms). */
  browseIdleTimeoutMs?: number;
  /** Overall cap for a single browse operation (ms). */
  browseTotalTimeoutMs?: number;
}

/** Only ever sent to the Grafana backend, never returned to the browser. */
export interface SolaceSecureJsonData {
  basicAuthPassword?: string;
}

export const DEFAULT_OPTIONS: Partial<SolaceDataSourceOptions> = {
  msgVpn: 'default',
  messagingEnabled: false,
  browseIdleTimeoutMs: 2000,
  browseTotalTimeoutMs: 20000,
};
