---
name: Bug report
about: Something isn't working as expected
title: "[Bug] "
labels: bug
---

## What happened

A clear description of the bug.

## What you expected

What you expected to happen instead.

## Steps to reproduce

1.
2.
3.

## Environment

- App version / commit:
- Node version:
- Running mode: [ ] live (Grafana) [ ] sample data (`MOCK=1` / no creds)
- Host: [ ] local [ ] Vercel [ ] other (specify)

## Diagnostics

If this involves live data, please run and paste the relevant output:

```bash
node --env-file=.env.local scripts/introspect.mjs
```

> ⚠️ **Do not paste your `GRAFANA_PROM_TOKEN` or any secret.** Redact tokens and
> instance IDs.

## Logs / screenshots

Any relevant error output or screenshots.
