# CodeRunBot (gaato bot)

## What is this

### CodeRunBot

It can run codes and render LaTeX.

### gaato bot

This is a bot for internal use that adds other functions to CodeRunBot. Also, this is for Japanese speakers.

## Links

- [Privacy Policy](discord/config/privacy-policy.md)
- [Invite Link](https://discord.com/api/oauth2/authorize?client_id=761428259241328680&permissions=0&scope=bot)
- [Discord Server](https://discord.gg/qRpYRTgvXM)

## Requirements

- Node.js >= 24
- [pnpm](https://pnpm.io/)

## How to run (CodeRunBot)

Set `CODERUNBOT_TOKEN` in the environment file.

### with pnpm

```bash
cd discord
pnpm install
pnpm build
pnpm start
```

### with Podman (or Docker)

```bash
podman build -t coderunbot discord
podman run --rm --env-file coderunbot.env coderunbot
```

Add `-v ./discord/data:/app/data` to persist the opt-out list across runs
when using the default local state backend.

## How to run (gaato bot)

Basically the same as CodeRunBot, but set the environment file to include `GAATO_BOT_TOKEN` and `WOLFRAM_APPID`, then run:

```bash
cd discord
GAATO_BOT=1 pnpm start
```

With Podman, add `-e GAATO_BOT=1` to the `podman run` command instead.

## For developer

Pull requests are welcome.
Please use [pnpm](https://pnpm.io/) to manage dependencies.
Do not rewrite `pnpm-lock.yaml` by hand.
TypeScript is pinned to the 6.x line because dependency-cruiser 18 does not
support TypeScript 7 yet.

## Environment

For containerized or service-manager based deployment, keep secrets outside the repo and point the process at an environment file.

- Example file: [`coderunbot.env.example`](coderunbot.env.example)

## License

Copyright (C) Gakuto Furuya

This program is free software, licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later).
If you run a modified version of this bot as a network service, the AGPL
requires you to offer its source code to the users interacting with it.
