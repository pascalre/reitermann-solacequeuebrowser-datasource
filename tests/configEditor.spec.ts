import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render config editor', async ({ createDataSourceConfigPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  await expect(page.getByLabel('Web Messaging URL')).toBeVisible();
  await expect(page.getByLabel('Message VPN')).toBeVisible();
  await expect(page.getByLabel('Client username')).toBeVisible();
  await expect(page.getByLabel('Idle timeout (ms)')).toBeVisible();
});

test('warns that the credentials are not a Grafana secret', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  await expect(page.getByText('visible to anyone who can read this data source')).toBeVisible();
});

test('"Save & test" fails when no Web Messaging URL is set', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });

  // A freshly created data source has no URL, so the health check must fail
  // immediately instead of opening a socket and hanging.
  await configPage.saveAndTest();
  await expect(configPage).toHaveAlert('error', { hasText: /Web Messaging URL/ });
});
