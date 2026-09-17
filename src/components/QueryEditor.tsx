import React, { ChangeEvent } from 'react';
import { Combobox, ComboboxOption, InlineField, InlineFieldRow, Input, Stack, Switch } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { DEFAULT_QUERY, PayloadFormat, SolaceDataSourceOptions, SolaceQuery } from '../types';

type Props = QueryEditorProps<DataSource, SolaceQuery, SolaceDataSourceOptions>;

const LABEL_WIDTH = 22;

const PAYLOAD_FORMATS: Array<ComboboxOption<PayloadFormat>> = [
  { value: 'auto', label: 'Auto', description: 'Pretty JSON, else UTF-8 text, else base64' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
];

export function QueryEditor({ query, datasource, onChange, onRunQuery }: Props) {
  const patch = (partial: Partial<SolaceQuery>, run = true) => {
    onChange({ ...query, ...partial });
    if (run) {
      onRunQuery();
    }
  };

  return (
    <Stack direction="column" gap={0}>
      <InlineFieldRow>
        <InlineField
          label="Queue"
          labelWidth={LABEL_WIDTH}
          tooltip={`Queue in Message VPN "${datasource.msgVpn}". Dashboard variables are supported.`}
          required
        >
          <Input
            id="query-queue"
            width={40}
            value={query.queueName ?? ''}
            placeholder="demo/orders/1"
            onChange={(event: ChangeEvent<HTMLInputElement>) => patch({ queueName: event.target.value }, false)}
            onBlur={() => onRunQuery()}
          />
        </InlineField>
        <InlineField
          label="Limit"
          labelWidth={12}
          tooltip="Browsing stops after this many messages, or earlier when the queue runs dry."
        >
          <Input
            id="query-limit"
            width={14}
            type="number"
            min={1}
            value={query.limit ?? DEFAULT_QUERY.limit}
            onChange={(event: ChangeEvent<HTMLInputElement>) => patch({ limit: Number(event.target.value) }, false)}
            onBlur={() => onRunQuery()}
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField label="Payload format" labelWidth={LABEL_WIDTH}>
          <Combobox
            id="query-payload-format"
            options={PAYLOAD_FORMATS}
            value={query.payloadFormat ?? DEFAULT_QUERY.payloadFormat!}
            width={26}
            onChange={(option) => patch({ payloadFormat: option.value })}
          />
        </InlineField>
        <InlineField
          label="Max payload chars"
          labelWidth={22}
          tooltip="Truncate long payloads so the table stays usable. 0 disables truncation."
        >
          <Input
            id="query-max-payload"
            width={14}
            type="number"
            min={0}
            value={query.maxPayloadChars ?? DEFAULT_QUERY.maxPayloadChars}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              patch({ maxPayloadChars: Number(event.target.value) }, false)
            }
            onBlur={() => onRunQuery()}
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField
          label="User properties as columns"
          labelWidth={32}
          tooltip="Adds one column per user property key found across the browsed messages."
        >
          <Switch
            id="query-user-properties"
            value={query.includeUserProperties ?? DEFAULT_QUERY.includeUserProperties}
            onChange={(event) => patch({ includeUserProperties: event.currentTarget.checked })}
          />
        </InlineField>
      </InlineFieldRow>
    </Stack>
  );
}
