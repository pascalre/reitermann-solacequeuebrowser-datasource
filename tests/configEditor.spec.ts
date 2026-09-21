import { test, expect } from '@grafana/plugin-e2e';

/**
 * The config editor uses `Field` descriptions, and Grafana folds those into the
 * accessible name. A plain getByLabel('Message VPN') therefore also matches the
 * password field, whose description reads "Leave empty if the Message VPN
 * allows unauthenticated clients". Anchoring the name at the start keeps each
 * locator pointed at exactly one input.
 */
const startsWith = (label: string) => new RegExp(`^${label}`);

test('smoke: should render config editor', async ({ createDataSourceConfigPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  await expect(page.getByRole('textbox', { name: startsWith('Web Messaging URL') })).toBeVisible();
  await expect(page.getByRole('textbox', { name: startsWith('Message VPN') })).toBeVisible();
  await expect(page.getByRole('textbox', { name: startsWith('Client username') })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: startsWith('Idle timeout') })).toBeVisible();
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
  selectors,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });

  // configPage.saveAndTest() cannot be used here. It waits for a response from
  // /api/datasources/uid/<uid>/health, and this plugin has no backend: the
  // health check opens a WebSocket from the browser and never issues that
  // request, so the helper would always time out. Click the button and assert
  // on the resulting alert instead.
  await configPage.getByGrafanaSelector(selectors.pages.DataSource.saveAndTest).click();

  await expect(configPage).toHaveAlert('error', { hasText: /Web Messaging URL/, timeout: 10000 });
});
