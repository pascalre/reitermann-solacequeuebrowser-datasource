import React, { ChangeEvent, useCallback } from 'react';
import { Alert, Field, Input, Stack } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, updateDatasourcePluginJsonDataOption } from '@grafana/data';
import { DEFAULT_OPTIONS, SolaceDataSourceOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<SolaceDataSourceOptions>;

export function ConfigEditor(props: Props) {
  const { options } = props;
  const { jsonData } = options;

  const setJsonData = useCallback(
    <K extends keyof SolaceDataSourceOptions>(key: K, value: SolaceDataSourceOptions[K]) => {
      updateDatasourcePluginJsonDataOption(props, key, value);
    },
    [props]
  );

  const onText =
    <K extends keyof SolaceDataSourceOptions>(key: K) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setJsonData(key, event.target.value as SolaceDataSourceOptions[K]);

  const onNumber =
    <K extends keyof SolaceDataSourceOptions>(key: K) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setJsonData(key, Number(event.target.value) as SolaceDataSourceOptions[K]);

  return (
    <Stack direction="column" gap={3}>
      <Stack direction="column" gap={0}>
        <h3 className="page-heading">Connection</h3>
        <p>
          The plugin browses queues with the Solace JavaScript API. The connection is opened by the browser, directly to
          the broker&apos;s Web Messaging service.
        </p>

        <Alert title="These credentials are visible to anyone who can read this data source" severity="warning">
          The Solace JavaScript API runs in the browser, so the connection details cannot be stored as a Grafana secret.
          Use a client username restricted to read-only access to the queues you want to browse, and use{' '}
          <code>wss://</code> outside of local development.
        </Alert>

        <Field
          label="Web Messaging URL"
          description="Reached from the browser, not from the Grafana server. e.g. ws://localhost:8008 or wss://mybroker.messaging.solace.cloud:443"
          required
        >
          <Input
            id="config-url"
            width={60}
            value={jsonData.url ?? ''}
            placeholder="ws://localhost:8008"
            onChange={onText('url')}
          />
        </Field>

        <Field label="Message VPN" description="Applies to every panel using this data source." required>
          <Input
            id="config-msg-vpn"
            width={40}
            value={jsonData.msgVpn ?? ''}
            placeholder={DEFAULT_OPTIONS.msgVpn}
            onChange={onText('msgVpn')}
          />
        </Field>

        <Field label="Client username" required>
          <Input
            id="config-user-name"
            width={40}
            value={jsonData.userName ?? ''}
            placeholder={DEFAULT_OPTIONS.userName}
            onChange={onText('userName')}
          />
        </Field>

        <Field label="Client password" description="Leave empty if the Message VPN allows unauthenticated clients.">
          <Input
            id="config-password"
            width={40}
            type="password"
            value={jsonData.password ?? ''}
            onChange={onText('password')}
          />
        </Field>
      </Stack>

      <Stack direction="column" gap={0}>
        <h3 className="page-heading">Timeouts</h3>

        <Field
          label="Idle timeout (ms)"
          description="Stop browsing when no further message arrives within this window. A queue holding fewer messages than the panel's limit ends here, so this is the floor for how long such a query takes."
        >
          <Input
            id="config-idle-timeout"
            width={20}
            type="number"
            min={100}
            value={jsonData.browseIdleTimeoutMs ?? DEFAULT_OPTIONS.browseIdleTimeoutMs}
            onChange={onNumber('browseIdleTimeoutMs')}
          />
        </Field>

        <Field label="Total timeout (ms)" description="Hard limit for a single browse.">
          <Input
            id="config-total-timeout"
            width={20}
            type="number"
            min={1000}
            value={jsonData.browseTotalTimeoutMs ?? DEFAULT_OPTIONS.browseTotalTimeoutMs}
            onChange={onNumber('browseTotalTimeoutMs')}
          />
        </Field>

        <Field label="Connect timeout (ms)" description="Applies to the messaging session and the queue bind.">
          <Input
            id="config-connect-timeout"
            width={20}
            type="number"
            min={1000}
            value={jsonData.connectTimeoutMs ?? DEFAULT_OPTIONS.connectTimeoutMs}
            onChange={onNumber('connectTimeoutMs')}
          />
        </Field>
      </Stack>
    </Stack>
  );
}
