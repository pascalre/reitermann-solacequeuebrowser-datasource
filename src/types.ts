import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export type PayloadFormat = 'auto' | 'text' | 'json' | 'base64' | 'hex';

export interface SolaceQuery extends DataQuery {
  /** Queue to browse. Dashboard variables are supported. */
  queueName?: string;
  /** Stop after this many messages. */
  limit?: number;
  /** How to render the payload. */
  payloadFormat?: PayloadFormat;
  /** Add one column per user property found on the browsed messages. */
  includeUserProperties?: boolean;
  /** Truncate payloads to this many characters (0 = no limit). */
  maxPayloadChars?: number;
}

export const DEFAULT_QUERY: Partial<SolaceQuery> = {
  limit: 100,
  payloadFormat: 'auto',
  includeUserProperties: true,
  maxPayloadChars: 4096,
};

/**
 * Data source configuration.
 *
 * The Solace JavaScript API runs in the browser, so everything the connection
 * needs has to live in `jsonData` — a Grafana secret would never reach the
 * client. That means any user who can read this data source can read the
 * messaging credentials. Use a client username restricted to read-only queue
 * access. See the warning rendered in the ConfigEditor.
 */
export interface SolaceDataSourceOptions extends DataSourceJsonData {
  /** Web Messaging endpoint reachable from the browser, e.g. ws://localhost:8008. */
  url?: string;
  /** Message VPN — configured here, not per panel. */
  msgVpn?: string;
  /** Client username. */
  userName?: string;
  /** Client password. */
  password?: string;
  /** Give up browsing after this long without a new message (ms). */
  browseIdleTimeoutMs?: number;
  /** Overall cap for a single browse operation (ms). */
  browseTotalTimeoutMs?: number;
  /** Connect timeout for the messaging session (ms). */
  connectTimeoutMs?: number;
}

export const DEFAULT_OPTIONS: Required<
  Pick<
    SolaceDataSourceOptions,
    'msgVpn' | 'userName' | 'browseIdleTimeoutMs' | 'browseTotalTimeoutMs' | 'connectTimeoutMs'
  >
> = {
  msgVpn: 'default',
  userName: 'default',
  browseIdleTimeoutMs: 2000,
  browseTotalTimeoutMs: 20000,
  connectTimeoutMs: 8000,
};
