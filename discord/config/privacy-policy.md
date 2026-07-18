# Privacy Policy

## Owner

Gakuto Furuya (gaato.)

## Bots

- **CodeRunBot**#4348
- **gaato bot** (private)

## What data we process

- **Message content** in channels the bot can read, used to detect and execute
  commands (e.g. `]run`, `]tex`) and, for gaato bot, to reply when mentioned.
  Message content is processed transiently and is not stored by us, except as
  described under "Error logs" below.
- **Opt-out list**: if you use `/opt-out`, your Discord user ID is stored
  persistently in cloud object storage so that the setting survives restarts.
  `/opt-in` removes it.
- **Error logs**: when a command fails unexpectedly, the invoking command text
  and the internal error trace are posted to a private developer-only Discord
  channel for debugging.

## Third-party services

Some commands send your input to external services to do their work:

- `/run`, `]run`: your code and standard input are sent to
  [Wandbox](https://wandbox.org) for execution.
- `]wolf`, `/wolf` (gaato bot): your query is sent to Wolfram|Alpha.
- `/translate` and mention replies (gaato bot): the text to translate, or the
  mentioning message together with up to 10 recent messages in the channel, is
  sent to OpenAI. Messages authored by opted-out users are excluded from that
  context.
- `/tex`, `]tex`: LaTeX is rendered inside the bot itself; nothing is sent to
  a third party.

These services receive only what is needed to fulfil the command and are
governed by their own privacy policies.

## Opting out

`/opt-out` stops all passive processing of your message content: prefix
commands, mention replies, edit tracking, and inclusion of your messages in
OpenAI context. Explicitly invoked slash commands and context menu commands
keep working, since using them is itself consent to process that input.

## Data deletion

We do not build up a store of user data: message content is discarded after a
command completes. To remove your stored user ID from the opt-out list, use
`/opt-in`. For anything else (e.g. an error log that captured your command),
ask on the [support server](https://discord.gg/qRpYRTgvXM) and it will be
deleted.
