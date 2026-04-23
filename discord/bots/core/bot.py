import io
import asyncio
import os
import pathlib
import traceback
from typing import TypeAlias, TypeGuard

import discord
from discord.ext import commands

from .. import DEVELOPER_ID, LOG_CHANNEL_ID, SUPPORT_SERVER_LINK, DeleteButton

BASE_DIR = pathlib.Path(__file__).parent.parent
SendableChannel: TypeAlias = (
    discord.TextChannel | discord.Thread | discord.DMChannel | discord.GroupChannel
)


def is_sendable_channel(channel: object) -> TypeGuard[SendableChannel]:
    return isinstance(
        channel,
        (discord.TextChannel, discord.Thread, discord.DMChannel, discord.GroupChannel),
    )


def ensure_event_loop() -> asyncio.AbstractEventLoop:
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


class Bot(commands.Bot):
    def __init__(self, token: str | None, cogs: list[str], prefix: str):
        self.token = token
        self.logging_channel: SendableChannel | None = None
        self.developer: discord.User | None = None
        intents = discord.Intents.default()
        intents.message_content = True
        ensure_event_loop()
        super().__init__(command_prefix=prefix, intents=intents)
        self.load_cogs(cogs)

    def load_cogs(self, cogs: list[str]) -> None:
        for cog in cogs:
            self.load_extension(cog)
            print('Loaded ' + cog)

    async def on_ready(self) -> None:
        user = self.user
        if user is None:
            return
        print(f'Logged in as {user} (ID: {user.id})')
        print(f'Pycord Version: {discord.__version__}')
        channel = self.get_channel(LOG_CHANNEL_ID)
        self.logging_channel = channel if is_sendable_channel(channel) else None
        self.developer = self.get_user(DEVELOPER_ID)


    async def on_message(self, message: discord.Message) -> None:
        opt_out_users = []
        if os.path.exists(BASE_DIR / 'data' / 'opt-out-users.txt'):
            with open(BASE_DIR / 'data' / 'opt-out-users.txt', 'r') as f:
                for line in f.readlines():
                    if line.strip():
                        opt_out_users.append(int(line))
        if message.author.id in opt_out_users:
            return
        await super().on_message(message)

    async def on_message_edit(
        self, before: discord.Message, after: discord.Message
    ) -> None:
        if before.content == after.content:
            return
        await self.on_message(after)

    async def on_command_error(
        self, context: commands.Context, exception: commands.CommandError
    ) -> None:
        if isinstance(exception, commands.CommandNotFound):
            return
        if isinstance(exception, commands.UserInputError):
            view = discord.ui.View(DeleteButton(context.author), timeout=None)
            embed = discord.Embed(
                title='Invalid Input',
                description=f'```\n{exception}\n```',
                color=0xff0000,
            )
            embed.set_author(
                name=context.author.name,
                icon_url=context.author.display_avatar.url,
            )
            await context.reply(embed=embed, view=view)
            return
        view = discord.ui.View(DeleteButton(context.author), timeout=None)
        embed = discord.Embed(
            title='Unhandled Error',
            color=0xff0000,
        )
        embed.set_author(
            name=context.author.name,
            icon_url=context.author.display_avatar.url,
        )
        await context.reply(
            content=f'Please Report us!\n{SUPPORT_SERVER_LINK}',
            embed=embed,
            view=view,
        )
        await self.log_error(context, exception)
        await super().on_command_error(context, exception)

    async def on_slash_command_error(
        self, ctx: discord.ApplicationContext, exception: Exception
    ) -> None:
        await self.log_error(ctx, exception)

    async def log_error(
        self, ctx: commands.Context | discord.ApplicationContext, exception: Exception
    ) -> None:
        if isinstance(ctx, commands.Context):
            content = ctx.message.content
        else:
            command_name = ctx.command.qualified_name if ctx.command else "unknown"
            option_values = " ".join(str(arg) for arg in (ctx.options or {}).values())
            content = f'/{command_name} {option_values}'.strip()
        exception_text = ''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))
        content_formatted = "```\n" + content + "\n```"
        # attempt to resolve the channel if not cached
        if self.logging_channel is None:
            try:
                channel = await self.fetch_channel(LOG_CHANNEL_ID)
            except Exception:
                print("Unable to fetch log channel", LOG_CHANNEL_ID)
                print(exception_text)
                return
            self.logging_channel = channel if is_sendable_channel(channel) else None
        if self.logging_channel is None:
            print("Log channel is not sendable", LOG_CHANNEL_ID)
            print(exception_text)
            return
        error_file = discord.File(
            io.BytesIO(exception_text.encode()),
            filename='error.txt',
        )
        # Try to send to Discord log channel, but don't raise if it fails; fallback to stdout
        try:
            await self.logging_channel.send(content=content_formatted, file=error_file)
        except discord.Forbidden:
            print('Bot missing access to log channel:', LOG_CHANNEL_ID)
            print(exception_text)
        except Exception:
            print('Failed to send log to channel:', LOG_CHANNEL_ID)
            traceback.print_exc()

    def run(self) -> None:
        if self.token is None:
            print('Missing Discord token')
            return
        try:
            self.loop.run_until_complete(self.start(self.token))
        except discord.LoginFailure:
            print('Invalid Discord Token')
        except KeyboardInterrupt:
            print('Shutdown')
            self.loop.run_until_complete(self.close())
        except Exception:
            traceback.print_exc()
