import React, { ChangeEvent, useCallback } from 'react';
import { Alert, Field, Input, SecretInput, Stack, Switch } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, updateDatasourcePluginJsonDataOption } from '@grafana/data';
import { DEFAULT_OPTIONS, SolaceDataSourceOptions, SolaceSecureJsonData } from '../types';

type Props = DataSourcePluginOptionsEditorProps<SolaceDataSourceOptions, SolaceSecureJsonData>;

const LABEL_WIDTH = 34;

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const setJsonData = useCallback(
    <K extends keyof SolaceDataSourceOptions>(key: K, value: SolaceDataSourceOptions[K]) => {
      updateDatasourcePluginJsonDataOption(props, key as string, value);
    },
    [props]
  );

  const onUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      url: event.target.value,
      // The SEMP API always needs credentials, so Grafana's basic auth is on.
      basicAuth: true,
    });
  };

  const onBasicAuthUserChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({ ...options, basicAuth: true, basicAuthUser: event.target.value });
  };

  const onPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      basicAuth: true,
      secureJsonData: { ...secureJsonData, basicAuthPassword: event.target.value },
    });
  };

  const onResetPassword = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: { ...secureJsonFields, basicAuthPassword: false },
      secureJsonData: { ...secureJsonData, basicAuthPassword: '' },
    });
  };

  const messagingEnabled = jsonData.messagingEnabled ?? DEFAULT_OPTIONS.messagingEnabled ?? false;

  return (
    <Stack direction="column" gap={3}>
      <Stack direction="column" gap={0}>
        <h3 className="page-heading">SEMP (management API)</h3>
        <p>
          Queue inventory, spool statistics and message metadata are read from the SEMP v2 monitor API. These requests
          go through the Grafana data source proxy, so the credentials below stay on the Grafana server.
        </p>

        <Field
          label="SEMP base URL"
          description="Scheme, host and management port only — no path. Reached from the Grafana server, e.g. http://solace:8080 or https://mybroker.messaging.solace.cloud:943"
          required
        >
          <Input
            id="config-semp-url"
            width={60}
            value={options.url ?? ''}
            placeholder="http://localhost:8080"
            onChange={onUrlChange}
          />
        </Field>

        <Field label="Default Message VPN" description="Used by queries that do not override it.">
          <Input
            id="config-msg-vpn"
            width={40}
            value={jsonData.msgVpn ?? ''}
            placeholder={DEFAULT_OPTIONS.msgVpn}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setJsonData('msgVpn', event.target.value)}
          />
        </Field>

        <Field label="Management username" description="A read-only monitoring user is enough." required>
          <Input
            id="config-semp-user"
            width={40}
            value={options.basicAuthUser ?? ''}
            placeholder="monitor"
            onChange={onBasicAuthUserChange}
          />
        </Field>

        <Field label="Management password" required>
          <SecretInput
            id="config-semp-password"
            width={40}
            isConfigured={Boolean(secureJsonFields?.basicAuthPassword)}
            value={secureJsonData?.basicAuthPassword ?? ''}
            placeholder="Enter the SEMP password"
            onChange={onPasswordChange}
            onReset={onResetPassword}
          />
        </Field>
      </Stack>

      <Stack direction="column" gap={0}>
        <h3 className="page-heading">Message browsing (Solace JavaScript API)</h3>
        <p>
          SEMP does not expose message payloads. To read payloads and headers the plugin opens a non-destructive queue
          browse over Web Messaging — from the browser, directly to the broker.
        </p>

        <Field
          label="Enable payload browsing"
          description="Turn off to keep the plugin SEMP-only (metadata, statistics, queue inventory)."
        >
          <Switch
            id="config-messaging-enabled"
            value={messagingEnabled}
            onChange={(event) => setJsonData('messagingEnabled', event.currentTarget.checked)}
          />
        </Field>

        {messagingEnabled && (
          <>
            <Alert title="The messaging credentials are visible to dashboard users" severity="warning">
              The Solace JavaScript API runs in the browser, so these credentials cannot be stored as a Grafana secret —
              anyone who can view this data source can read them. Use a dedicated client username that is restricted to
              read-only queue access, and prefer <code>wss://</code> outside of local development.
            </Alert>

            <Field
              label="Web Messaging URL"
              description="Reached from the browser, not from the Grafana server. e.g. ws://localhost:8008 or wss://mybroker.messaging.solace.cloud:443"
              required
            >
              <Input
                id="config-ws-url"
                width={60}
                value={jsonData.webMessagingUrl ?? ''}
                placeholder="ws://localhost:8008"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setJsonData('webMessagingUrl', event.target.value)}
              />
            </Field>

            <Field label="Client username" required>
              <Input
                id="config-messaging-user"
                width={40}
                value={jsonData.messagingUserName ?? ''}
                placeholder="default"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setJsonData('messagingUserName', event.target.value)
                }
              />
            </Field>

            <Field label="Client password">
              <Input
                id="config-messaging-password"
                width={40}
                type="password"
                value={jsonData.messagingPassword ?? ''}
                placeholder="Leave empty if the VPN allows unauthenticated clients"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setJsonData('messagingPassword', event.target.value)
                }
              />
            </Field>

            <Field
              label="Idle timeout (ms)"
              description="Stop browsing when no further message arrives within this window. A queue with fewer messages than the query limit ends here."
            >
              <Input
                id="config-idle-timeout"
                width={20}
                type="number"
                value={jsonData.browseIdleTimeoutMs ?? DEFAULT_OPTIONS.browseIdleTimeoutMs}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setJsonData('browseIdleTimeoutMs', Number(event.target.value))
                }
              />
            </Field>

            <Field label="Total timeout (ms)" description="Hard limit for a single browse operation.">
              <Input
                id="config-total-timeout"
                width={20}
                type="number"
                value={jsonData.browseTotalTimeoutMs ?? DEFAULT_OPTIONS.browseTotalTimeoutMs}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setJsonData('browseTotalTimeoutMs', Number(event.target.value))
                }
              />
            </Field>
          </>
        )}
      </Stack>
    </Stack>
  );
}
