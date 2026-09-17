import solace from 'solclientjs';
import { BrowsedMessage, mapMessage } from './message';
import { PayloadFormat } from './types';

export interface ConnectionOptions {
  /** Web Messaging URL reachable from the browser, e.g. ws://localhost:8008. */
  url: string;
  msgVpn: string;
  userName: string;
  password?: string;
  connectTimeoutMs: number;
}

export interface BrowseOptions extends ConnectionOptions {
  queueName: string;
  /** Stop after this many messages. */
  limit: number;
  /** Stop when no further message arrives within this window. */
  idleTimeoutMs: number;
  /** Hard stop for the whole operation. */
  totalTimeoutMs: number;
  payloadFormat: PayloadFormat;
  maxPayloadChars: number;
}

type SolaceApi = typeof solace;

let factoryReady = false;

/**
 * `SolclientFactory.init` must run before anything else in the API is touched,
 * and repeated calls are no-ops. Doing it on first use rather than at module
 * load keeps it out of Grafana's plugin-loading path.
 *
 * solclientjs is imported statically on purpose. A dynamic import would put it
 * in a separate webpack chunk, and Grafana serves plugin assets from a single
 * dist directory that dev and production builds name differently. A stale
 * directory then fails with "Loading chunk ... failed". Since every query and
 * the health check need the library anyway, splitting it saved nothing.
 */
function solaceApi(): SolaceApi {
  if (!factoryReady) {
    solace.SolclientFactory.init(
      new solace.SolclientFactoryProperties({
        profile: solace.SolclientFactoryProfiles.version10_5,
        logLevel: solace.LogLevel.WARN,
      })
    );
    factoryReady = true;
  }
  return solace;
}

function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; reason?: { message?: string } };
    const parts = [candidate.message, candidate.reason?.message].filter(Boolean);
    if (parts.length > 0) {
      return parts.join('; ');
    }
  }
  return String(error);
}

function createSession(api: SolaceApi, options: ConnectionOptions): solace.Session {
  return api.SolclientFactory.createSession(
    new api.SessionProperties({
      url: options.url,
      vpnName: options.msgVpn,
      userName: options.userName,
      password: options.password,
      connectRetries: 0,
      connectRetriesPerHost: 0,
      connectTimeoutInMsecs: options.connectTimeoutMs,
      reapplySubscriptions: false,
      generateSendTimestamps: false,
      generateReceiveTimestamps: true,
    })
  );
}

function disposeQuietly(session: solace.Session, browser?: solace.QueueBrowser): void {
  try {
    browser?.disconnect();
  } catch {
    // already down
  }
  try {
    session.disconnect();
  } catch {
    // already down
  }
  try {
    session.dispose();
  } catch {
    // already disposed
  }
}

/**
 * Opens a messaging session and closes it again. This is the data source health check.
 * Resolves with the broker's transport description.
 */
export async function testConnection(options: ConnectionOptions): Promise<string> {
  const api = solaceApi();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const session = createSession(api, options);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        disposeQuietly(session);
        reject(new Error(`Timed out after ${options.connectTimeoutMs} ms connecting to ${options.url}`));
      }
    }, options.connectTimeoutMs + 1000);

    session.on(api.SessionEventCode.UP_NOTICE, () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const transport = (() => {
        try {
          return session.getTransportInfo();
        } catch {
          return options.url;
        }
      })();
      disposeQuietly(session);
      resolve(transport);
    });

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      disposeQuietly(session);
      reject(new Error(describe(error)));
    };

    session.on(api.SessionEventCode.CONNECT_FAILED_ERROR, fail);
    session.on(api.SessionEventCode.DOWN_ERROR, fail);

    try {
      session.connect();
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Browses a queue without consuming from it and resolves with the messages seen.
 *
 * Resolves early, and successfully, when the queue holds fewer messages than
 * `limit`: a browse has no "end of queue" event, so an idle window is the only
 * way to tell "nothing more is coming" from "still arriving".
 *
 * `removeMessageFromQueue` is deliberately never called: that would delete
 * messages from the broker.
 */
export async function browseQueue(options: BrowseOptions): Promise<BrowsedMessage[]> {
  const api = solaceApi();

  const limit = Math.max(1, options.limit);
  const messages: BrowsedMessage[] = [];

  return new Promise<BrowsedMessage[]>((resolve, reject) => {
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    let browser: solace.QueueBrowser | undefined;

    const session = createSession(api, options);

    const cleanup = () => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
      disposeQuietly(session, browser);
    };

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(messages);
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, options.idleTimeoutMs);
    };

    totalTimer = setTimeout(finish, options.totalTimeoutMs);

    const startBrowsing = () => {
      try {
        browser = session.createQueueBrowser({
          queueDescriptor: { name: options.queueName, type: api.QueueType.QUEUE },
          windowSize: Math.min(limit, 255),
          connectTimeoutInMsecs: options.connectTimeoutMs,
          connectAttempts: 1,
        });
      } catch (error) {
        fail(`Could not create the queue browser: ${describe(error)}`);
        return;
      }

      browser.on(api.QueueBrowserEventName.UP, resetIdleTimer);
      browser.on(api.QueueBrowserEventName.CONNECT_FAILED_ERROR, (error) =>
        fail(`Could not bind to queue "${options.queueName}": ${describe(error)}`)
      );
      browser.on(api.QueueBrowserEventName.DOWN_ERROR, (error) =>
        fail(`Browsing "${options.queueName}" failed: ${describe(error)}`)
      );
      browser.on(api.QueueBrowserEventName.MESSAGE, (message) => {
        if (settled) {
          return;
        }
        messages.push(mapMessage(message, options.payloadFormat, options.maxPayloadChars));
        if (messages.length >= limit) {
          finish();
        } else {
          resetIdleTimer();
        }
      });

      try {
        browser.connect();
      } catch (error) {
        fail(`Could not connect the queue browser: ${describe(error)}`);
      }
    };

    session.on(api.SessionEventCode.UP_NOTICE, startBrowsing);
    session.on(api.SessionEventCode.CONNECT_FAILED_ERROR, (error) =>
      fail(`Could not connect to ${options.url}: ${describe(error)}`)
    );
    session.on(api.SessionEventCode.DOWN_ERROR, (error) => fail(`Messaging session went down: ${describe(error)}`));

    try {
      session.connect();
    } catch (error) {
      fail(`Could not start the messaging session: ${describe(error)}`);
    }
  });
}
