# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-17

### Features

- Non-destructive queue browse against Solace Event Broker via the Solace JavaScript API over Web
  Messaging. Messages are never acknowledged, consumed or removed.
- Payload rendering as pretty-printed JSON, UTF-8 text, base64 or hex, with an `auto` mode that
  picks whichever fits, plus configurable truncation.
- Structured (SDT) message support: the payload is read from the SDT container when present.
- Message headers mapped to typed columns, with field types inferred from the data.
- User properties optionally expanded into one `prop.<key>` column each.
- Connection settings (Web Messaging URL, Message VPN and client credentials) configured once on the
  data source. Panels only name a queue and a limit.
- Health check that opens and closes a real messaging session against the configured Message VPN.
- Dashboard variable support for the queue name.
- Configurable idle, total and connect timeouts, since a queue browse has no end-of-queue event.

[unreleased]: https://github.com/pascalre/reitermann-solacequeuebrowser-datasource/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/pascalre/reitermann-solacequeuebrowser-datasource/releases/tag/v1.0.0
