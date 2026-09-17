import {
  CoreApp,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  ScopedVars,
  TestDataSourceResponse,
} from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { browseQueue, testConnection } from './browser';
import { emptyDataFrame, rowsToDataFrame } from './frames';
import { BROWSE_COLUMNS, flattenBrowsedMessage } from './message';
import { DEFAULT_OPTIONS, DEFAULT_QUERY, SolaceDataSourceOptions, SolaceQuery } from './types';

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export class DataSource extends DataSourceApi<SolaceQuery, SolaceDataSourceOptions> {
  readonly options: SolaceDataSourceOptions;

  constructor(instanceSettings: DataSourceInstanceSettings<SolaceDataSourceOptions>) {
    super(instanceSettings);
    this.options = { ...DEFAULT_OPTIONS, ...instanceSettings.jsonData };
  }

  get msgVpn(): string {
    return this.options.msgVpn ?? DEFAULT_OPTIONS.msgVpn;
  }

  getDefaultQuery(_app: CoreApp): Partial<SolaceQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: SolaceQuery, scopedVars: ScopedVars): SolaceQuery {
    return {
      ...query,
      queueName: query.queueName ? getTemplateSrv().replace(query.queueName, scopedVars) : query.queueName,
    };
  }

  filterQuery(query: SolaceQuery): boolean {
    return !query.hide && Boolean(query.queueName);
  }

  private connection() {
    const { url, userName, password, connectTimeoutMs } = this.options;
    if (!url) {
      throw new Error('No Web Messaging URL configured in the data source settings.');
    }
    return {
      url,
      msgVpn: this.msgVpn,
      userName: userName ?? DEFAULT_OPTIONS.userName,
      password,
      connectTimeoutMs: connectTimeoutMs ?? DEFAULT_OPTIONS.connectTimeoutMs,
    };
  }

  async query(request: DataQueryRequest<SolaceQuery>): Promise<DataQueryResponse> {
    const targets = request.targets.filter((target) => this.filterQuery(target));

    // Browses run one after another: each one binds a flow to the broker, and a
    // dashboard full of panels should not open a dozen flows at once.
    const frames: DataFrame[] = [];
    const errors: Array<{ refId?: string; message: string }> = [];

    for (const target of targets) {
      try {
        frames.push(await this.browse(target));
      } catch (error) {
        frames.push(emptyDataFrame(BROWSE_COLUMNS, { refId: target.refId }));
        errors.push({ refId: target.refId, message: describeError(error) });
      }
    }

    return { data: frames, errors: errors.length > 0 ? errors : undefined };
  }

  private async browse(target: SolaceQuery): Promise<DataFrame> {
    const messages = await browseQueue({
      ...this.connection(),
      queueName: target.queueName!,
      limit: Math.max(1, target.limit ?? DEFAULT_QUERY.limit!),
      idleTimeoutMs: this.options.browseIdleTimeoutMs ?? DEFAULT_OPTIONS.browseIdleTimeoutMs,
      totalTimeoutMs: this.options.browseTotalTimeoutMs ?? DEFAULT_OPTIONS.browseTotalTimeoutMs,
      payloadFormat: target.payloadFormat ?? DEFAULT_QUERY.payloadFormat!,
      maxPayloadChars: target.maxPayloadChars ?? DEFAULT_QUERY.maxPayloadChars!,
    });

    if (messages.length === 0) {
      return emptyDataFrame(BROWSE_COLUMNS, { refId: target.refId, name: target.queueName });
    }

    const includeUserProperties = target.includeUserProperties ?? DEFAULT_QUERY.includeUserProperties!;
    const rows = messages.map((message) => flattenBrowsedMessage(message, includeUserProperties));

    return rowsToDataFrame(rows, {
      refId: target.refId,
      name: target.queueName,
      order: BROWSE_COLUMNS,
    });
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    try {
      const transport = await testConnection(this.connection());
      return {
        status: 'success',
        message: `Connected to Message VPN "${this.msgVpn}" (${transport}).`,
      };
    } catch (error) {
      return { status: 'error', message: describeError(error) };
    }
  }
}
