import React, { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { InlineField, InlineFieldRow, Input, Select, Stack, Switch } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { DEFAULT_QUERY, PayloadFormat, SolaceDataSourceOptions, SolaceQuery, SolaceQueryType } from '../types';

type Props = QueryEditorProps<DataSource, SolaceQuery, SolaceDataSourceOptions>;

const LABEL_WIDTH = 20;

const QUERY_TYPES: Array<SelectableValue<SolaceQueryType>> = [
  {
    value: SolaceQueryType.Queues,
    label: 'Queues',
    description: 'Inventory and spool statistics of all queues in the Message VPN (SEMP)',
  },
  {
    value: SolaceQueryType.QueueStats,
    label: 'Queue details',
    description: 'All monitored attributes of a single queue (SEMP)',
  },
  {
    value: SolaceQueryType.Messages,
    label: 'Spooled messages (metadata)',
    description: 'Message IDs, spool times and sizes — no payload (SEMP)',
  },
  {
    value: SolaceQueryType.MessagePayloads,
    label: 'Browse messages (payload)',
    description: 'Non-destructive browse with payload, headers and user properties (Solace JS API)',
  },
];

const PAYLOAD_FORMATS: Array<SelectableValue<PayloadFormat>> = [
  { value: 'auto', label: 'Auto', description: 'Pretty JSON, else UTF-8 text, else base64' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
];

export function QueryEditor({ query, datasource, onChange, onRunQuery }: Props) {
  const queryType = query.queryType ?? DEFAULT_QUERY.queryType!;
  const needsQueue = queryType !== SolaceQueryType.Queues;
  const isBrowse = queryType === SolaceQueryType.MessagePayloads;

  const [queueOptions, setQueueOptions] = useState<Array<SelectableValue<string>>>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

  const loadQueues = useCallback(async () => {
    setLoadingQueues(true);
    try {
      const names = await datasource.listQueueNames(query.msgVpn);
      setQueueOptions(names.map((name) => ({ value: name, label: name })));
    } catch (err) {
      setQueueOptions([]);
    } finally {
      setLoadingQueues(false);
    }
  }, [datasource, query.msgVpn]);

  useEffect(() => {
    if (needsQueue) {
      loadQueues();
    }
  }, [needsQueue, loadQueues]);

  const patch = (partial: Partial<SolaceQuery>, run = true) => {
    onChange({ ...query, ...partial });
    if (run) {
      onRunQuery();
    }
  };

  return (
    <Stack direction="column" gap={0}>
      <InlineFieldRow>
        <InlineField label="Query type" labelWidth={LABEL_WIDTH} grow>
          <Select
            inputId="query-type"
            options={QUERY_TYPES}
            value={queryType}
            width={46}
            onChange={(selected) => patch({ queryType: selected.value! })}
          />
        </InlineField>
        <InlineField
          label="Message VPN"
          labelWidth={LABEL_WIDTH}
          tooltip="Leave empty to use the VPN configured on the data source. Supports dashboard variables."
        >
          <Input
            id="query-msg-vpn"
            width={24}
            value={query.msgVpn ?? ''}
            placeholder={datasource.defaultMsgVpn}
            onChange={(event: ChangeEvent<HTMLInputElement>) => patch({ msgVpn: event.target.value }, false)}
            onBlur={() => onRunQuery()}
          />
        </InlineField>
      </InlineFieldRow>

      {needsQueue && (
        <InlineFieldRow>
          <InlineField
            label="Queue"
            labelWidth={LABEL_WIDTH}
            tooltip="Pick a queue or type a name. Dashboard variables are supported."
            grow
            required
          >
            <Select
              inputId="query-queue"
              options={queueOptions}
              value={query.queueName ?? null}
              width={46}
              allowCustomValue
              isLoading={loadingQueues}
              placeholder="Select a queue"
              onOpenMenu={loadQueues}
              onChange={(selected) => patch({ queueName: selected?.value ?? undefined })}
              onCreateOption={(value) => patch({ queueName: value })}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {queryType === SolaceQueryType.Queues && (
        <InlineFieldRow>
          <InlineField
            label="Filter (SEMP where)"
            labelWidth={LABEL_WIDTH}
            tooltip="SEMP v2 where expression, e.g. queueName==order* or msgSpoolUsage>0"
            grow
          >
            <Input
              id="query-where"
              width={46}
              value={query.where ?? ''}
              placeholder="queueName==order*"
              onChange={(event: ChangeEvent<HTMLInputElement>) => patch({ where: event.target.value }, false)}
              onBlur={() => onRunQuery()}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {queryType !== SolaceQueryType.QueueStats && (
        <InlineFieldRow>
          <InlineField label="Limit" labelWidth={LABEL_WIDTH} tooltip="Maximum number of rows to return.">
            <Input
              id="query-limit"
              width={16}
              type="number"
              min={1}
              value={query.limit ?? DEFAULT_QUERY.limit}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                patch({ limit: Number(event.target.value) }, false)
              }
              onBlur={() => onRunQuery()}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {isBrowse && (
        <>
          <InlineFieldRow>
            <InlineField label="Payload format" labelWidth={LABEL_WIDTH}>
              <Select
                inputId="query-payload-format"
                options={PAYLOAD_FORMATS}
                value={query.payloadFormat ?? DEFAULT_QUERY.payloadFormat}
                width={24}
                onChange={(selected) => patch({ payloadFormat: selected.value! })}
              />
            </InlineField>
            <InlineField
              label="Max payload chars"
              labelWidth={LABEL_WIDTH}
              tooltip="Truncate long payloads so the table stays usable. 0 disables truncation."
            >
              <Input
                id="query-max-payload"
                width={16}
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
        </>
      )}
    </Stack>
  );
}
