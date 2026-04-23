# CodeRunBot (gaato bot)

## What is this

### CodeRunBot

It can run codes and render LaTeX.

### gaato bot

This is a bot for internal use that adds other functions to CodeRunBot. Also, this is for Japanese speakers.

## Links

- [Privacy Policy](bots/config/privacy-policy.md)
- [Invite Link](https://discord.com/api/oauth2/authorize?client_id=761428259241328680&permissions=0&scope=bot)
- [Discord Server](https://discord.gg/qRpYRTgvXM)

## Requirements

- Python >= 3.10
- [tex.gaato.net](https://github.com/gaato/tex.gaato.net)

## How to run (CodeRunBot)

Set `CODERUNBOT_TOKEN` in the environment file.

### with venv (recommended)

```
$ source /path/to/venv/bin/activate
$ pip install pip-tools
$ pip-sync
$ python -m bots
```

### without venv

```
$ pip install -r requirements.txt
$ python -m bots
```

## How to run (gaato bot)

Basically the same as CodeRunBot, but set the environment file to include `GAATO_BOT_TOKEN`, `GOOGLE_API_KEY` and `WOLFRAM_APPID` and the execution command is as follows. You also need ffmpeg.

```
$ python -m bots -g
```

## For developer

Pull requests are welcome.
Please use [pip-tools](https://github.com/jazzband/pip-tools) to manage packages.
Do not rewrite requirements.txt by hand.

## Environment

For containerized or service-manager based deployment, keep secrets outside the repo and point the process at an environment file.

- Example file: [`coderunbot.env.example`](coderunbot.env.example)
- `TEX_BASE_URL` defaults to `http://127.0.0.1:8080`
- The TeX renderer can be started with `HOST` and `PORT` overrides
