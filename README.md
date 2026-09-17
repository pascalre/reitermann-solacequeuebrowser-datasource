# Solace Queue Browser: Grafana data source

Browses [Solace Event Broker](https://solace.com/) queues from a Grafana dashboard and shows the
messages that are spooled in them, including payload, headers and user properties, without consuming
them.

Frontend-only plugin: there is no Go backend to build.

## How it works

The plugin opens a queue browse with the Solace JavaScript API (`solclientjs`) over Web Messaging.
The connection is made **by the browser, directly to the broker**. Grafana's server is not involved.

The browse is read-only. `removeMessageFromQueue()` is never called, so nothing is acknowledged,
consumed or deleted; the messages stay available for their real consumers.

> **Security note.** Because the Solace JavaScript API runs in the browser, the connection details
> cannot be stored as a Grafana secret. Any user who can read the data source can read them. Use a
> client username restricted to read-only access to the queues you want to browse, and use `wss://`
> outside of local development.

## Configuration

Everything about the connection lives on the data source, including the **Message VPN**. Panels only
name a queue.

| Setting           | Notes                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| Web Messaging URL | Reached from the **browser**: `ws://localhost:8008`, `wss://host:443`     |
| Message VPN       | Applies to every panel using this data source                             |
| Client username   | A read-only client username is enough                                     |
| Client password   | May be empty if the VPN allows unauthenticated clients                    |
| Idle timeout      | Stop when no further message arrives within this window (default 2000 ms) |
| Total timeout     | Hard limit for a single browse (default 20000 ms)                         |
| Connect timeout   | Messaging session and queue bind (default 8000 ms)                        |

**Save & test** opens a real messaging session against the configured VPN and closes it again.

## The query

| Field                      | Notes                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Queue                      | Queue name; dashboard variables are supported                       |
| Limit                      | Stop after this many messages (default 100)                         |
| Payload format             | `auto`, `json`, `text`, `base64`, `hex`                             |
| Max payload chars          | Truncate long payloads; `0` disables truncation                     |
| User properties as columns | One `prop.<key>` column per user property found across the messages |

`auto` pretty-prints JSON, falls back to UTF-8 text, and falls back again to base64 for anything
binary, so a queue mixing formats still renders. Structured (SDT) messages are read from their
container rather than the binary attachment.

Columns come from the messages themselves, with types inferred, so a payload shape or an API version
that adds fields shows up without a plugin change.

### Why a browse can take a few seconds

A queue browse has no end-of-queue event. The browse therefore ends on whichever comes first: the
query limit, an idle window with no new message, or the total timeout. A queue holding fewer messages
than the limit always costs the idle timeout. Lower it if that feels slow, raise it on a loaded
broker.

Panels are browsed one after another rather than in parallel: every browse binds a flow on the
broker, and a dashboard full of panels should not open a dozen flows at once.

## Local development

```bash
npm install
npm run dev          # webpack watch
npm run server       # Grafana plus a Solace Event Broker via docker compose
npm run seed         # create demo queues and spool messages into them
```

`npm run server` starts Grafana on <http://localhost:3000> with the data source already provisioned
(`provisioning/datasources/datasources.yml`) and a `solace/solace-pubsub-standard` broker alongside
it:

| Port  | Service                                                     |
| ----- | ----------------------------------------------------------- |
| 8008  | Web Messaging (WebSocket), which is what the plugin uses    |
| 8080  | Broker Manager / SEMP (`admin` / `admin`), to manage queues |
| 9000  | REST messaging, used by `npm run seed`                      |
| 55554 | SMF (remapped: macOS blocks 55555 on the host)              |

`npm run seed` waits for the broker, creates `demo/orders/1..3` and spools JSON messages with user
properties into them. It talks to the broker's SEMP config API and REST messaging service directly.
The plugin itself never uses SEMP.

The first broker start takes a minute or two.

If the broker exits during startup with `FATAL: Unable to find valid network interface` /
`Failed to update dbBaseline`, its config database was left half-written by an earlier interrupted
start. Reset it and start again:

```bash
docker compose down -v
docker compose up
```

The broker needs at least 2 GiB of memory in the container VM. On Rancher Desktop, Colima or Podman
Machine, check the VM's memory setting before blaming the broker. Grafana is wired with
`depends_on: service_started`, so it comes up even when the broker does not.

Note that changes to `src/plugin.json` require a Grafana restart.

### Other commands

```bash
npm run typecheck
npm run lint
npx jest             # unit tests: message mapping, payload decoding, frame mapping
npm run e2e          # @grafana/plugin-e2e tests, needs `npm run server` running
npm run build
```

## Source layout

| File                      | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `src/browser.ts`          | solclientjs session, queue browser and health check                   |
| `src/message.ts`          | `solace.Message` to flat row, declared structurally so it is testable |
| `src/payload.ts`          | Payload decoding: JSON / UTF-8 / base64 / hex, truncation             |
| `src/frames.ts`           | Generic row to DataFrame mapping with type inference                  |
| `src/datasource.ts`       | Query dispatch, template variables, health check                      |
| `src/components/`         | Config and query editors                                              |
| `scripts/seed-broker.mjs` | Development seeding via the broker's SEMP config plus REST messaging  |

solclientjs is imported statically, which puts the bundle at roughly 520 KiB. That is deliberate: a
dynamic import would move it into a separate webpack chunk, and because dev and production builds
name chunks differently while Grafana serves one `dist` directory, a stale directory fails at runtime
with `Loading chunk ... failed`. Every query and the health check need the library anyway, so splitting
it bought nothing. The webpack size warning on `npm run build` is expected.

## Known limitations

- A browse always starts at the oldest message. There is no seek to an offset, a message ID or a
  timestamp, because the JavaScript API does not offer one.
- No queue discovery: the queue name is typed, not picked from a list. Listing queues would need the
  SEMP management API, which this plugin deliberately does not use.
- No Grafana alerting or recording rules, which would need a backend plugin.
- Browsing a queue that has an active consumer gives no guarantee that every message is seen; the
  consumer may take messages before the browser reaches them.
