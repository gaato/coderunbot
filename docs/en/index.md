# How to use CodeRunBot

## Introduction

This bot is made by gaato ([@gaato__](https://twitter.com/gaato__)).

- Official Discord server: [here](https://discord.gg/qRpYRTgvXM)
- [Invite link](https://discord.com/api/oauth2/authorize?client_id=761428259241328680&permissions=0&scope=bot)

## Installation

There are two ways to use the bot.

- **Add to a server**: adds slash commands plus `]`-prefixed text commands.
- **User install**: add the app to your own account and use the slash commands
  (`/run`, `/tex`, ...) in DMs and in servers that don't have the bot.

## Commands

### /run

Pick a language (with autocomplete) and a form opens for your code and
standard input. The code runs on [Wandbox](https://wandbox.org).

Supported languages are fetched dynamically from Wandbox — whatever appears in
the autocomplete is what is available.

### ]run (server only)

```
]run language
code
```

Code fences (```) are ignored.

```
]run python
print('hello')
```

### /tex

Opens a form for LaTeX input. The `env` option wraps your input in an
align / gather environment, and `spoiler` posts the image as a spoiler.

### ]tex / ]stex (server only)

```
]tex x^2 + y^2 = r^2
```

Renders LaTeX (math mode) as an image. `]stex` posts it as a spoiler.

### Right-click a message → Apps → escape

Shows the message content with Markdown and mentions escaped (visible only to you).

### /privacy-policy, /opt-out, /opt-in

Shows the privacy policy and lets you opt out of / back into message content
processing. See the [privacy policy](../../discord/config/privacy-policy.md)
for details.

## Handy behaviors

- Every bot reply has a **Delete button** that only the invoking user can press.
- If you **edit** the message that invoked `]run` or `]tex`, the bot's reply is
  updated automatically.
