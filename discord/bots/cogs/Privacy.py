import pathlib

import discord
from discord.commands import slash_command
from discord.ext import commands

from bots.core.bot import OPT_OUT_USERS

BASE_DIR = pathlib.Path(__file__).parent.parent


class Privacy(commands.Cog):

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @slash_command(name='privacy-policy')
    async def privacy_policy(self, ctx: discord.ApplicationContext):
        """Show the privacy policy"""
        with open(BASE_DIR / 'config' / 'privacy-policy.md', 'r') as f:
            await ctx.respond(f.read())

    @slash_command(name='opt-out')
    async def opt_out(self, ctx: discord.ApplicationContext):
        """Opt out of your message content data to be tracked"""
        if ctx.author.id in OPT_OUT_USERS:
            await ctx.respond('Your message content is already off-track. To use other commands, please use the /opt-in command.')
        else:
            OPT_OUT_USERS.add(ctx.author.id)
            await ctx.respond('This bot will not track your message content from now on. Most commands will no longer respond.')

    @slash_command(name='opt-in')
    async def opt_in(self, ctx: discord.ApplicationContext):
        """Opt out of your message content data to be tracked"""
        if ctx.author.id in OPT_OUT_USERS:
            OPT_OUT_USERS.remove(ctx.author.id)
            await ctx.respond('This bot will now track the content of your messages. It will only be used to provide commands. Use the /privacy-policy command to view the privacy policy.')
        else:
            await ctx.respond('This bot is already tracking your message content.')


def setup(bot):
    return bot.add_cog(Privacy(bot))
