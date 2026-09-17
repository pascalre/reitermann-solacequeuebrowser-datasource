# Solace Queue Browser

Browses [Solace PubSub+](https://solace.com/) queues from a Grafana dashboard and shows the messages
spooled in them — payload, headers and user properties — without consuming them.

## Overview

The plugin opens a non-destructive queue browse with the Solace JavaScript API over the broker's Web
Messaging service. The connection is made by the browser, directly to the broker. Nothing is
acknowledged, consumed or deleted: the messages remain available for their real consumers.

A panel names a queue and a limit. The connection — Web Messaging URL, Message VPN and client
credentials — is configured once on the data source.

Payloads render as pretty-printed JSON, UTF-8 text, base64 or hex; `auto` picks whichever fits, so a
queue mixing formats still displays. User properties can be expanded into one column each.

## Requirements

- A Solace PubSub+ broker (software, appliance or Cloud) whose Web Messaging service is reachable
  from the **user's browser**.
- A client username with read access to the queues you want to browse.
- Grafana 12.3 or newer.

## Getting started

1. Add the data source and set the Web Messaging URL (`ws://` or `wss://`), the Message VPN and the
   client username and password.
2. Use **Save & test** — it opens a real messaging session against that VPN and closes it again.
3. In a panel, type a queue name and pick a visualization; Table is the natural fit.

> **Security note.** The Solace JavaScript API runs in the browser, so the connection details cannot
> be stored as a Grafana secret — any user who can read the data source can read them. Use a client
> username restricted to read-only queue access and `wss://` in production.

## Notes and limitations

- A browse always starts at the oldest message; there is no seek to an offset or timestamp.
- A browse has no "end of queue" event, so it ends on the query limit, an idle window with no new
  message, or the total timeout. A queue with fewer messages than the limit costs the idle timeout.
- Queue names are typed rather than picked from a list; queue discovery would require the SEMP
  management API, which this plugin does not use.
- Browsing a queue with an active consumer gives no guarantee that every message is seen.
- Alerting and recording rules are not supported; those require a backend plugin.
