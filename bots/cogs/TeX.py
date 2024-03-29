import base64
import io
import pathlib
import sqlite3
from typing import Optional, Tuple

import aiohttp
import discord
from discord.ext import commands

from .. import SUPPORT_SERVER_LINK, DeleteButton, LimitedSizeDict

BASE_DIR = pathlib.Path(__file__).parent.parent
dbname = BASE_DIR.parent / "db.sqlite3"
conn = sqlite3.connect(dbname, check_same_thread=False)
c = conn.cursor()
c.execute(
    "CREATE TABLE IF NOT EXISTS tex (message_id INTEGER, author_id INTEGER, code TEXT, spoiler INTEGER)"
)


async def respond_core(
    author: discord.User, code: str, spoiler: bool
) -> Tuple[str, discord.Embed, Optional[discord.File]]:
    url = f"http://tex.gaato.net/render/png"
    params = {"latex": code}
    headers = {"Content-Type": "application/json"}
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=params, headers=headers) as r:
            if r.status == 200:
                result = await r.read()
                file = discord.File(
                    io.BytesIO(result), filename=f"tex.png", spoiler=spoiler
                )
                embed = discord.Embed(color=0x008000)
                embed.set_author(name=author.name, icon_url=author.display_avatar.url)
                if not spoiler:
                    embed.set_image(url="attachment://tex.png")
                if "\\\\" in code and "\\begin" not in code and "\\end" not in code:
                    embed.add_field(
                        name="Hint", value="You can use gather or align environment."
                    )
                return "", embed, file
            else:
                error_message = await r.text()
                embed = discord.Embed(
                    title="Rendering Error",
                    description=f"```\n{error_message}\n```",
                    color=0xFF0000,
                )
                embed.set_author(
                    name=author.name,
                    icon_url=author.display_avatar.url,
                )
                return "", embed, None


class EditButton(discord.ui.Button):
    def __init__(self, label="Edit", style=discord.ButtonStyle.primary, **kwargs):
        super().__init__(label=label, style=style, **kwargs)

    async def callback(self, interaction: discord.Interaction):
        c = conn.cursor()
        c.execute("SELECT * FROM tex WHERE message_id = ?", (interaction.message.id,))
        result = c.fetchone()
        if result is None:
            embed = discord.Embed(
                title="Error", description="Not found.", color=0xFF0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        await interaction.response.send_modal(
            TeXModal(spoiler=bool(result[3]), value=result[2])
        )


class TeXModal(discord.ui.Modal):
    def __init__(
        self, spoiler, env=None, value="", title="LaTeX to Image", *arg, **kwargs
    ):
        self.spoiler = spoiler
        if env:
            value = f"\\begin{{{env}}}\n{value}\n\\end{{{env}}}"
        super().__init__(title=title, *arg, **kwargs)
        self.add_item(
            discord.ui.InputText(
                label="Code",
                placeholder="Input TeX code here",
                style=discord.InputTextStyle.long,
                value=value,
            )
        )

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(invisible=False)
        content, embed, file = await respond_core(
            interaction.user,
            self.children[0].value,
            self.spoiler,
        )
        embed.add_field(
            name="Code",
            value=f"```tex\n{self.children[0].value}\n```",
        )
        view = discord.ui.View(
            DeleteButton(interaction.user), EditButton(), timeout=None
        )
        if file is None:
            m = await interaction.followup.send(
                content=content, embed=embed, view=view, wait=True
            )
        else:
            m = await interaction.followup.send(
                content=content, embed=embed, file=file, view=view, wait=True
            )
        c = conn.cursor()
        c.execute(
            "INSERT INTO tex VALUES (?, ?, ?, ?)",
            (m.id, interaction.user.id, self.children[0].value, int(self.spoiler)),
        )


class TeX(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.user_message_id_to_bot_message = LimitedSizeDict(size_limit=100)

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        if before.content != after.content:
            if before.id in self.user_message_id_to_bot_message:
                await self.user_message_id_to_bot_message[before.id].delete()

    async def respond(self, ctx: commands.Context, code: str, spoiler: bool):
        async with ctx.channel.typing():
            view = discord.ui.View(DeleteButton(ctx.author), timeout=None)
            code = code.replace("```tex", "").replace("```", "").strip()
            content, embed, file = await respond_core(ctx.author, code, spoiler)
            if file is None:
                m = await ctx.reply(content=content, embed=embed, view=view)
            else:
                m = await ctx.reply(content=content, embed=embed, file=file, view=view)
            return m

    @commands.command()
    async def tex(self, ctx: commands.Context, *, code: str):
        """LaTeX to image (in math mode)"""
        m = await self.respond(ctx, code, False)
        self.user_message_id_to_bot_message[ctx.message.id] = m

    # @commands.command()
    # async def texp(self, ctx: commands.Context, *, code: str):
    #     """LaTeX to image (out of math mode)"""
    #     m = await self.respond(ctx, code, 'png', True, False)
    #     self.user_message_id_to_bot_message[ctx.message.id] = m

    @commands.command()
    async def stex(self, ctx: commands.Context, *, code: str):
        """LaTeX to spoiler image (in math mode)"""
        m = await self.respond(ctx, code, True)
        self.user_message_id_to_bot_message[ctx.message.id] = m

    # @commands.command()
    # async def stexp(self, ctx: commands.Context, *, code: str):
    #     """LaTeX to spoiler image (out of math mode)"""
    #     m = await self.respond(ctx, code, 'png', True, True)
    #     self.user_message_id_to_bot_message[ctx.message.id] = m

    # @commands.command()
    # async def texpdf(self, ctx: commands.Context, *, code: str):
    #     """LaTeX to PDF (from preamble)"""
    #     m = await self.respond(ctx, code, 'pdf', None, False)
    #     self.user_message_id_to_bot_message[ctx.message.id] = m

    @discord.slash_command(
        name="tex",
        description="TeX to image",
        options=[
            discord.Option(
                type=str,
                name="env",
                description="The environment to use",
                required=False,
                choices=[
                    discord.OptionChoice(name="align", value="align"),
                    discord.OptionChoice(name="gather", value="gather"),
                ],
            ),
            discord.Option(
                type=bool,
                name="spoiler",
                description="Whether to mark the image as a spoiler",
                required=False,
                default=False,
            ),
        ],
    )
    async def tex_slash(
        self,
        ctx: discord.ApplicationContext,
        env: Optional[str] = None,
        spoiler: bool = False,
    ):
        # modal = TeXModal(plain, spoiler)
        modal = TeXModal(spoiler, env)
        await ctx.send_modal(modal)


def setup(bot):
    return bot.add_cog(TeX(bot))
