import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  const row = panelEditPage.getQueryEditorRow('A');
  await expect(row.getByLabel('Queue')).toBeVisible();
  await expect(row.getByLabel('Limit')).toBeVisible();
  await expect(row.getByLabel('Payload format')).toBeVisible();
});

test('the query editor has no Message VPN field, it belongs to the data source', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  await expect(panelEditPage.getQueryEditorRow('A').getByLabel('Message VPN')).toBeHidden();
});

test('no query runs until a queue is named', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  // filterQuery() suppresses the query, so the panel stays on "No data"
  // rather than opening a browse against an empty queue name.
  await panelEditPage.refreshPanel();
  await expect(panelEditPage.panel.getErrorIcon()).not.toBeVisible();
});
