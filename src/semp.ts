import { getBackendSrv, isFetchError } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

export const SEMP_MONITOR_BASE = '/SEMP/v2/monitor';

/** SEMP caps a single page at 100 objects. */
export const SEMP_MAX_COUNT = 100;

export interface SempPaging {
  cursorQuery?: string;
  nextPageUri?: string;
}

export interface SempError {
  code?: number;
  description?: string;
  status?: string;
}

export interface SempMeta {
  responseCode?: number;
  count?: number;
  paging?: SempPaging;
  error?: SempError;
  request?: unknown;
}

export interface SempResponse<T> {
  data?: T;
  meta?: SempMeta;
  links?: unknown;
}

export interface SempAbout {
  platform?: string;
  sempVersion?: string;
}

export type SempObject = Record<string, unknown>;

type QueryParams = Record<string, string | number | boolean | undefined>;

/** Pulls the most useful message out of whatever the broker or proxy returned. */
export function describeSempError(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isFetchError(err)) {
    const meta = (err.data as SempResponse<unknown> | undefined)?.meta;
    if (meta?.error?.description) {
      return meta.error.description;
    }
    if (typeof err.data === 'string' && err.data.length > 0) {
      return err.data;
    }
    return err.statusText || `HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Unknown SEMP error';
}

/**
 * Thin typed wrapper around the SEMP v2 monitor API.
 *
 * Every request goes through the Grafana data source proxy, so the SEMP
 * credentials stay on the Grafana server and the browser never sees them (and
 * we never have to think about CORS).
 */
export class SempClient {
  constructor(private readonly proxyBaseUrl: string) {}

  private buildUrl(path: string, params: QueryParams = {}): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        search.set(key, String(value));
      }
    }
    const query = search.toString();
    return `${this.proxyBaseUrl}${SEMP_MONITOR_BASE}${path}${query ? `?${query}` : ''}`;
  }

  /** Rewrites the broker's absolute nextPageUri onto our proxy base URL. */
  private rewriteNextPage(nextPageUri?: string): string | undefined {
    if (!nextPageUri) {
      return undefined;
    }
    const index = nextPageUri.indexOf(SEMP_MONITOR_BASE);
    if (index < 0) {
      return undefined;
    }
    return `${this.proxyBaseUrl}${nextPageUri.slice(index)}`;
  }

  private async fetchUrl<T>(url: string): Promise<SempResponse<T>> {
    const observable = getBackendSrv().fetch<SempResponse<T>>({
      url,
      method: 'GET',
      showErrorAlert: false,
    });
    const response = await lastValueFrom(observable);
    return response.data;
  }

  /** Follows `nextPageUri` until `limit` objects are collected. */
  private async collect(path: string, params: QueryParams, limit: number): Promise<SempObject[]> {
    const collected: SempObject[] = [];
    let url: string | undefined = this.buildUrl(path, {
      ...params,
      count: Math.min(Math.max(limit, 1), SEMP_MAX_COUNT),
    });

    while (url && collected.length < limit) {
      const response: SempResponse<SempObject[]> = await this.fetchUrl<SempObject[]>(url);
      collected.push(...(response.data ?? []));
      url = this.rewriteNextPage(response.meta?.paging?.nextPageUri);
    }

    return collected.slice(0, limit);
  }

  /** Broker platform and SEMP version — cheap request used for the health check. */
  async about(): Promise<SempAbout> {
    const response = await this.fetchUrl<SempAbout>(this.buildUrl('/about/api'));
    return response.data ?? {};
  }

  async listMsgVpnNames(limit = SEMP_MAX_COUNT): Promise<string[]> {
    const rows = await this.collect('/msgVpns', { select: 'msgVpnName' }, limit);
    return rows.map((row) => String(row.msgVpnName)).filter(Boolean);
  }

  async listQueues(msgVpn: string, opts: { where?: string; limit?: number } = {}): Promise<SempObject[]> {
    return this.collect(`/msgVpns/${encodeURIComponent(msgVpn)}/queues`, { where: opts.where }, opts.limit ?? 100);
  }

  async listQueueNames(msgVpn: string, limit = SEMP_MAX_COUNT): Promise<string[]> {
    const rows = await this.collect(
      `/msgVpns/${encodeURIComponent(msgVpn)}/queues`,
      { select: 'queueName' },
      limit
    );
    return rows.map((row) => String(row.queueName)).filter(Boolean);
  }

  async getQueue(msgVpn: string, queueName: string): Promise<SempObject> {
    const url = this.buildUrl(`/msgVpns/${encodeURIComponent(msgVpn)}/queues/${encodeURIComponent(queueName)}`);
    const response = await this.fetchUrl<SempObject>(url);
    return response.data ?? {};
  }

  /**
   * Metadata of the messages currently spooled in a queue. SEMP does not expose
   * the payload — that is what the Solace JS API browse in `browser.ts` is for.
   */
  async listQueueMsgs(msgVpn: string, queueName: string, limit = 100): Promise<SempObject[]> {
    return this.collect(
      `/msgVpns/${encodeURIComponent(msgVpn)}/queues/${encodeURIComponent(queueName)}/msgs`,
      {},
      limit
    );
  }
}
