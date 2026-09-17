# Solace Queue Browser

Look at the messages sitting in a [Solace Event Broker](https://solace.com) queue, including payload,
headers and user properties, from a Grafana dashboard, without consuming them.

Debugging a stuck queue normally means leaving Grafana: open Broker Manager, browse the queue, copy a
payload out. This data source brings that last step into the dashboard you are already looking at,
next to the spool metrics that told you something was wrong.

<!-- SCREENSHOTS: add 2 or 3 PNGs to src/img/ and reference them from plugin.json before publishing.
     Suggested set:
       1. A Table panel showing browsed messages with a JSON payload expanded.
       2. The query editor: queue, limit, payload format.
       3. The data source settings page. -->

## What it does

- **Browses, never consumes.** The plugin binds a queue browser and reads; it never acknowledges or
  removes a message. Everything stays available for the real consumers.
- **Shows the payload.** Rendered as pretty-printed JSON, UTF-8 text, base64 or hex. `auto` tries
  JSON first, falls back to text, then to base64, so a queue mixing formats still displays.
  Structured (SDT) messages are read from their container.
- **Shows the metadata.** Replication group message ID, destination, application message ID and
  type, correlation ID, priority, redelivery, delivery count, TTL and expiry, as typed columns.
- **Expands user properties.** Optionally one `prop.<key>` column per user property found across the
  browsed messages.

## What it does not do

- **No seek.** A browse always starts at the oldest message. The Solace JavaScript API offers no
  seek to an offset, message ID or timestamp.
- **No queue discovery.** Queue names are typed, not picked from a list. Listing queues would require
  the SEMP management API, which this plugin deliberately does not use. That keeps the plugin to a
  single, read-only messaging connection.
- **No alerting.** Alerting and recording rules need a backend plugin; this one is frontend-only.
- **No guarantee of completeness on a busy queue.** If a queue has an active consumer, the consumer
  may take messages before the browser reaches them.

## Requirements

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| Broker       | Solace Event Broker: software broker, appliance, or Solace Cloud                     |
| Reachability | The broker's **Web Messaging** service must be reachable from the **user's browser** |
| Credentials  | A client username with read access to the queues you want to browse                  |
| Grafana      | 12.3 or newer                                                                        |

## Setting it up

1. Add the data source and fill in the **Web Messaging URL** (`ws://host:8008` for a local software
   broker, `wss://host:443` for Solace Cloud), the **Message VPN**, and the client username and
   password.
2. Click **Save & test**. This opens a real messaging session against that Message VPN and closes it
   again, so a green result means the browser can actually reach the broker, not just that the form
   is filled in.
3. In a panel, choose the **Table** visualization and type a queue name.

The Message VPN belongs to the data source, not to the panel: add one data source per VPN.

## Before you deploy this

**The connection details are readable by anyone who can view this data source.** The Solace
JavaScript API runs in the user's browser, so the URL, Message VPN, username and password cannot be
stored as a Grafana secret. They are part of the data source's JSON configuration and are sent to
the browser by design.

Treat that as the deciding constraint:

- Create a **dedicated client username** with read-only access, scoped to the queues that should be
  browsable. Do not reuse an application or admin client username.
- Use `wss://` anywhere but local development.
- Restrict who can view and edit the data source with Grafana's data source permissions.
- Remember that message payloads are business data. Anyone who can add a panel against this data
  source can read the contents of any queue the client username can bind to.

## How long a query takes

A queue browse has no end-of-queue event, so the browse ends on whichever comes first: the panel's
limit, an idle window with no new message, or the total timeout. A queue holding fewer messages than
the limit therefore always costs the idle timeout (2 seconds by default). Lower it for snappier
panels, raise it on a loaded broker.

Panels are browsed one after another rather than in parallel, because each browse binds a flow on the
broker.

## Contributing and support

This is a community plugin, supported by its author on a best-effort basis. Bug reports and pull
requests are welcome, see
[CONTRIBUTING.md](https://github.com/pascalre/reitermann-solacequeuebrowser-datasource/blob/main/CONTRIBUTING.md).
Please report problems via
[GitHub issues](https://github.com/pascalre/reitermann-solacequeuebrowser-datasource/issues) rather
than through Solace support: it is not a Solace product.

Licensed under Apache-2.0. Solace and Solace Event Broker are trademarks of Solace Corporation. This
plugin is not an official Solace product.
