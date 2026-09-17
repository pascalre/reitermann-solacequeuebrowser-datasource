# Contributing

Bug reports, feature requests and pull requests are welcome.

## Reporting a bug

Open an [issue](https://github.com/pascalre/reitermann-solacequeuebrowser-datasource/issues) and
include:

- the Grafana version and the plugin version,
- the broker version (`SolOS`) and whether it is a software broker, an appliance or Solace Cloud,
- the Web Messaging URL scheme (`ws://` or `wss://`), but not the credentials,
- what the panel showed versus what you expected, and any error from the browser console.

Please do not paste message payloads from a production broker into an issue.

## Development

```bash
npm install
npm run dev          # webpack watch
npm run server       # Grafana plus a Solace Event Broker via docker compose
npm run seed         # create demo queues and spool messages into them
```

Grafana runs on <http://localhost:3000> with the data source already provisioned. See the
[README](./README.md) for the port map and for troubleshooting the local broker.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npx jest
npm run build
npm run e2e          # needs `npm run server` running
```

Please keep the unit tests meaningful. `src/message.ts`, `src/payload.ts` and `src/frames.ts` are
the layers most likely to break against a new broker or API version, and they are covered
deliberately. `src/browser.ts` holds the transport and is exercised through the e2e tests and manual
testing against a real broker.
