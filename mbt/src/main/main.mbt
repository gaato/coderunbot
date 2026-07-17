///|
fn ping_command() -> @discord.Command[Unit] {
  @discord.slash(
    name="ping",
    description="Check whether the bot is online",
    args=@discord.Args::unit(),
    handler=Immediate((_, _) => @discord.CommandReply::message(content="pong")),
  )
}

///|
async fn privacy_policy() -> String {
  let path = @env.get_env_var("PRIVACY_POLICY_FILE").unwrap_or(
    "./config/privacy-policy.md",
  )
  @fs.read_file(path).text()
}

///|
fn intents() -> @model.Intents {
  @model.Intents::guilds() |
  @model.Intents::guild_messages() |
  @model.Intents::direct_messages() |
  @model.Intents::message_content()
}

///|
fn command_sync() -> @discord.CommandSync {
  match @env.get_env_var("GUILD_ID") {
    Some(raw) => {
      let guild_id : @model.GuildId? = Some(@model.Id::parse(raw)) catch {
        _ => None
      }
      match guild_id {
        Some(value) => Guild(value)
        None => {
          println("[bot] invalid GUILD_ID, syncing globally")
          Global
        }
      }
    }
    None => Global
  }
}

///|
async fn main {
  @signal.set_global_cancellation_signals([SIGINT, SIGTERM])
  try {
    guard @env.get_env_var("CODERUNBOT_MBT_TOKEN") is Some(token) &&
      !token.trim().is_empty() else {
      println("[error] CODERUNBOT_MBT_TOKEN is required; refusing to connect")
      return
    }
    let client = @dhttp.Client(token)
    defer client.close()
    let users = @state.load_opt_out_users(@state.TextState::from_env())
    let policy = privacy_policy()
    let cache = @wandbox.LanguageCache()
    let renderer = @texrender.TexRenderer()
    let app = @discord.App(sync=command_sync())
    app.command(ping_command())
    app.on_warn(message => println("[warn] \{message}"))
    app.error_policy((ctx, error) => {
      let content = "Please Report us!\n\{@core.SUPPORT_SERVER_LINK}"
      try {
        match ctx.user() {
          Some(user) =>
            ctx.respond_error(
              content~,
              embeds=[
                @model.Embed(
                  title="Unhandled Error",
                  color=0xFF0000,
                  author=@model.EmbedAuthor(user.username),
                ),
              ],
              components=[@core.delete_row(user.id.value())],
            )
          None => ctx.respond_error(content~)
        }
      } catch {
        response_error =>
          println(
            "[warn] failed to report interaction error: \{to_repr(response_error)}",
          )
      }
      @core.log_error(client, "\{to_repr(ctx.origin())}", error)
    })
    @core.install_delete_handler(app)
    @features.install_code(app, cache)
    @features.install_tex(app, renderer)
    @features.install_privacy(app, users, policy)

    let bot = @discord.Bot(app, token~, client~, intents=intents())
    bot.attach_cache(
      @cache.InMemoryCache(
        resources=@cache.CacheResources(messages=true),
        max_messages_per_channel=100,
      ),
    )
    @features.install_prefix(bot, cache, renderer, users)
    bot.service(name="language-cache", _ => cache.warm())
    bot.service(name="texworker", _ => renderer.supervise())
    bot.on(@discord.Events::ready(), (_, ready) => {
      println("[bot] ready as \{ready.user.username}")
    })
    bot.run()
  } catch {
    error if @async.is_being_cancelled() || @async.is_cancellation_error(error) =>
      ()
    error => raise error
  }
  println("[bot] shutting down")
}
