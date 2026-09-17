#!/usr/bin/env node
/**
 * Seeds the local development broker with queues and spooled messages so the
 * plugin has something to show.
 *
 *   node scripts/seed-broker.mjs [--queues 3] [--messages 25]
 *
 * Uses only the broker's HTTP interfaces:
 *   - SEMP v2 config (8080) to create the queues
 *   - REST messaging  (9000) to publish persistent messages into them
 */

const SEMP_URL = process.env.SOLACE_SEMP_URL ?? 'http://localhost:8080';
const REST_URL = process.env.SOLACE_REST_URL ?? 'http://localhost:9000';
const VPN = process.env.SOLACE_VPN ?? 'default';
const ADMIN_USER = process.env.SOLACE_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.SOLACE_ADMIN_PASSWORD ?? 'admin';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const QUEUE_COUNT = arg('queues', 3);
const MESSAGE_COUNT = arg('messages', 25);

const authHeader = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64')}`;

async function semp(method, path, body) {
  const response = await fetch(`${SEMP_URL}/SEMP/v2/config${path}`, {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const description = parsed?.meta?.error?.description ?? text;
    const status = parsed?.meta?.error?.status;
    // Re-creating an existing object is fine when re-seeding.
    if (status === 'ALREADY_EXISTS') {
      return { skipped: true };
    }
    throw new Error(`SEMP ${method} ${path} failed (${response.status}): ${description}`);
  }
  return parsed;
}

async function waitForBroker() {
  process.stdout.write('Waiting for the broker to answer SEMP');
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${SEMP_URL}/SEMP/v2/monitor/about/api`, {
        headers: { Authorization: authHeader },
      });
      if (response.ok) {
        const body = await response.json();
        process.stdout.write(`\nBroker ready: SEMP ${body?.data?.sempVersion} on ${body?.data?.platform}\n`);
        return;
      }
    } catch {
      // broker not up yet
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Broker at ${SEMP_URL} did not become ready`);
}

async function enableVpnRest() {
  // The REST messaging service needs to listen on 9000 for the publish step.
  await semp('PATCH', `/msgVpns/${encodeURIComponent(VPN)}`, {
    restTlsServerCertEnforceTrustedCommonNameEnabled: false,
    serviceRestIncomingPlainTextListenPort: 9000,
    serviceRestIncomingPlainTextEnabled: true,
    serviceRestMode: 'messaging',
    authenticationBasicType: 'none',
  }).catch((err) => {
    console.warn(`Could not adjust the VPN REST settings: ${err.message}`);
  });
}

async function createQueue(name) {
  const result = await semp('POST', `/msgVpns/${encodeURIComponent(VPN)}/queues`, {
    msgVpnName: VPN,
    queueName: name,
    accessType: 'non-exclusive',
    permission: 'consume',
    ingressEnabled: true,
    egressEnabled: true,
    maxMsgSpoolUsage: 100,
    respectTtlEnabled: false,
  });
  console.log(result?.skipped ? `Queue ${name} already exists` : `Created queue ${name}`);
}

async function publish(queue, index) {
  const body = {
    orderId: `ORD-${String(index).padStart(5, '0')}`,
    customer: ['acme', 'globex', 'initech', 'umbrella'][index % 4],
    amount: Math.round(Math.random() * 100000) / 100,
    currency: 'EUR',
    items: [
      { sku: `SKU-${(index * 7) % 500}`, qty: (index % 5) + 1 },
      { sku: `SKU-${(index * 13) % 500}`, qty: (index % 3) + 1 },
    ],
    createdAt: new Date(Date.now() - index * 60_000).toISOString(),
  };

  const response = await fetch(`${REST_URL}/QUEUE/${encodeURIComponent(queue)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Solace-Delivery-Mode': 'persistent',
      'Solace-Message-ID': `seed-${queue}-${index}`,
      'Solace-User-Property-source': 'seed-script',
      'Solace-User-Property-batch': String(Math.floor(index / 10)),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Publish to ${queue} failed (${response.status}): ${await response.text()}`);
  }
}

async function main() {
  await waitForBroker();
  await enableVpnRest();

  const queues = Array.from({ length: QUEUE_COUNT }, (_, i) => `demo/orders/${i + 1}`);

  for (const queue of queues) {
    await createQueue(queue);
  }

  for (const queue of queues) {
    for (let i = 1; i <= MESSAGE_COUNT; i++) {
      await publish(queue, i);
    }
    console.log(`Spooled ${MESSAGE_COUNT} messages into ${queue}`);
  }

  console.log('\nDone. Open Grafana on http://localhost:3000 and query the Solace Queue Browser data source.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
