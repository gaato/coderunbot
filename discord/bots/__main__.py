import os

from bots.core.bot import Bot
from dotenv import load_dotenv

CODERUNBOT_COGS = ["bots.cogs.TeX", "bots.cogs.Code", "bots.cogs.Privacy"]
GAATO_BOT_COGS = [
    "bots.cogs.TeX",
    "bots.cogs.Code",
    "bots.cogs.Privacy",
    "bots.cogs.Wolfram",
    "bots.cogs.Misc",
    "bots.cogs.Translate",
]


def main() -> None:
    load_dotenv(verbose=True)

    coderunbot_token = os.environ.get("CODERUNBOT_TOKEN")
    gaato_bot_token = os.environ.get("GAATO_BOT_TOKEN")

    if os.environ.get("GAATO_BOT"):
        Bot(gaato_bot_token, GAATO_BOT_COGS, ")").run()
        return

    Bot(coderunbot_token, CODERUNBOT_COGS, "]").run()


if __name__ == "__main__":
    main()
