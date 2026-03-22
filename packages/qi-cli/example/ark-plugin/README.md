# ark-plugin

Volcengine Ark provider plugin for Agent-Qi.

This plugin restores Ark support through the plugin system instead of the built-in desktop provider list.

## Features

- Registers the `ark` provider factory
- Adds an `Ark` provider entry to the app settings
- Keeps the existing provider settings page workflow for base URL, API keys, and model refresh
- Supports Ark image and video generation helpers

## Development

```bash
pnpm install
pnpm build
```

Load the plugin directory in Agent-Qi through the plugin settings page, or package it with the Qi CLI workflow if needed.
