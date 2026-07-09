# Contributing

Thanks for your interest in improving ProbeView! This guide covers how to set up
your environment, the checks we expect to pass, and how to propose changes.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open a [bug report](.github/ISSUE_TEMPLATE/bug_report.md).
  Include your environment, what you expected, and what happened.
- **Request a feature** — open a [feature request](.github/ISSUE_TEMPLATE/feature_request.md).
- **Improve the docs** — typos, clarifications, and missing setup steps are all
  welcome and a great first contribution.
- **Send a fix or feature** — see below.

## Development setup

You need **Node.js 24+** and **pnpm 11+** (`corepack enable` gives you the right
pnpm version).

```bash
git clone <your-fork-url> probeview
cd probeview
pnpm install
pnpm dev          # runs on sample data — no Grafana credentials required
```

You do **not** need a Grafana Cloud account to develop the UI: with no
`.env.local`, the app serves representative sample data. To work against live
data, copy `.env.example` to `.env.local` and fill it in — see the
[Configuration reference](docs/configuration.md).

## Before you open a pull request

Run the full check suite locally. CI runs the same commands.

```bash
pnpm check           # format & lint with Biome (autofix)
pnpm test            # unit tests (Vitest)
pnpm test:types      # type-check, including tests
pnpm test:e2e        # Playwright end-to-end tests
pnpm build           # production build must succeed
```

A change is ready when all of the above pass.

## Coding guidelines

- **Keep the data layer and the UI separate.** Computation (uptime, status,
  latency) belongs in `lib/synthetics.ts`; components stay presentational.
- **No new charting dependencies.** Charts are intentionally hand-rolled SVG.
- **Keep secrets server-side.** Never give a Grafana credential a `NEXT_PUBLIC_`
  prefix or read it in client code.
- **Add tests** for new logic in `lib/`, and update docs when you change
  configuration or behaviour.
- **Match the surrounding style.** Follow existing naming, comment density, and
  file structure.

## Pull request process

1. Fork the repo and create a branch from `main` (e.g. `fix/uptime-rounding`).
2. Make your change, with tests and docs as needed.
3. Ensure all checks above pass.
4. Open a PR using the [template](.github/PULL_REQUEST_TEMPLATE.md). Describe
   *what* changed and *why*, and link any related issue.
5. A maintainer will review. Please be responsive to feedback — small, focused
   PRs are reviewed fastest.

## License of contributions

This project is licensed under the **GNU General Public License v3.0**. By
submitting a contribution, you agree that it will be licensed under the same
terms. See [`LICENSE`](LICENSE).
