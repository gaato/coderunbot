///|
pub(all) enum PrefixCommand {
  Run(language~ : String, code~ : String)
  Tex(code~ : String, spoiler~ : Bool)
  Invalid(String)
} derive(Debug, Eq)

///|
pub fn strip_fences(value : String) -> String {
  value
  .split("\n")
  .filter(line => !line.trim().has_prefix("```"))
  .collect()
  .join("\n")
  .trim()
  .to_owned()
}

///|
pub fn strip_tex_fences(value : String) -> String {
  value
  .replace_all(old="```tex", new="")
  .replace_all(old="```", new="")
  .trim()
  .to_owned()
}

///|
pub fn parse_prefix(value : String) -> PrefixCommand? {
  guard value.has_prefix("]") else { return None }
  let body = value[1:].trim()
  let (name, rest) = body.split_once(" ").unwrap_or((body, ""))
  match name.to_lower() {
    "run" =>
      match rest.trim().split_once(" ") {
        Some((language, code)) if !language.is_empty() &&
          !code.trim().is_empty() =>
          Some(
            Run(
              language=language.to_owned(),
              code=strip_fences(code.to_owned()),
            ),
          )
        _ => Some(Invalid("usage: ]run <language> <code>"))
      }
    "tex" if !rest.trim().is_empty() =>
      Some(Tex(code=strip_tex_fences(rest.to_owned()), spoiler=false))
    "stex" if !rest.trim().is_empty() =>
      Some(Tex(code=strip_tex_fences(rest.to_owned()), spoiler=true))
    "tex" | "stex" => Some(Invalid("usage: ]tex <code>"))
    _ => None
  }
}

///|
priv struct TrackedReply {
  content : String
  channel_id : @model.ChannelId
  reply_id : @model.MessageId
}

///|
priv struct PrefixFeature {
  cache : @wandbox.LanguageCache
  renderer : @texrender.TexRenderer
  users : @state.OptOutUsers
  replies : @core.BoundedMap[@model.MessageId, TrackedReply]
}

///|
fn PrefixFeature::PrefixFeature(
  cache : @wandbox.LanguageCache,
  renderer : @texrender.TexRenderer,
  users : @state.OptOutUsers,
) -> PrefixFeature {
  { cache, renderer, users, replies: BoundedMap(limit=100) }
}

///|
fn invalid_input(author_name : String, message : String) -> @model.Embed {
  @core.embed(
    title="Invalid Input",
    description="```\n\{message}\n```",
    color=0xFF0000,
    author_name~,
  )
}

///|
async fn PrefixFeature::reply_for(
  self : PrefixFeature,
  ctx : @discord.GatewayCtx,
  message : @model.Message,
  command : PrefixCommand,
) -> @model.Message {
  ctx.app().http().trigger_typing(message.channel_id)
  let reference = ctx.ref_of_message(message)
  match command {
    Run(language~, code~) => {
      let output = run_code(self.cache, message.author.username, language, code)
      reference.reply(embeds=[output.embed], files=uploads(output.files), components=[
        @core.delete_row(message.author.id.value()),
      ])
    }
    Tex(code~, spoiler~) => {
      let output = render_tex(
        self.renderer,
        message.author.username,
        code,
        spoiler,
      )
      reference.reply(embeds=[output.embed], files=uploads(output.files), components=[
        @core.delete_row(message.author.id.value()),
      ])
    }
    Invalid(reason) =>
      reference.reply(embeds=[invalid_input(message.author.username, reason)], components=[
        @core.delete_row(message.author.id.value()),
      ])
  }
}

///|
async fn PrefixFeature::report_prefix_error(
  _self : PrefixFeature,
  ctx : @discord.GatewayCtx,
  message : @model.Message,
  error : Error,
) -> Unit {
  let response = @core.embed(
    title="Unhandled Error",
    color=0xFF0000,
    author_name=message.author.username,
  )
  try
    ctx
    .ref_of_message(message)
    .reply(
      content="Please Report us!\n\{@core.SUPPORT_SERVER_LINK}",
      embeds=[response],
      components=[@core.delete_row(message.author.id.value())],
    )
    |> ignore
  catch {
    _ => ()
  }
  @core.log_error(ctx.app().http(), message.content, error)
}

///|
async fn PrefixFeature::dispatch(
  self : PrefixFeature,
  ctx : @discord.GatewayCtx,
  message : @model.Message,
) -> Unit {
  if message.author.bot.unwrap_or(false) ||
    self.users.contains(message.author.id.value()) {
    return
  }
  guard parse_prefix(message.content) is Some(command) else { return }
  try {
    let reply = self.reply_for(ctx, message, command)
    self.replies.set(message.id, {
      content: message.content,
      channel_id: reply.channel_id,
      reply_id: reply.id,
    })
  } catch {
    error => self.report_prefix_error(ctx, message, error)
  }
}

///|
async fn PrefixFeature::on_update(
  self : PrefixFeature,
  ctx : @discord.GatewayCtx,
  event : @model.MessageUpdateEvent,
) -> Unit {
  let message = event.message
  match self.replies.get(message.id) {
    Some(previous) if previous.content == message.content => return
    Some(previous) => {
      ctx
      .app()
      .http()
      .message_ref(previous.channel_id, previous.reply_id)
      .delete() catch {
        _ => ()
      }
      self.replies.remove(message.id)
      self.dispatch(ctx, message)
    }
    None =>
      if message.edited_timestamp is Value(_) {
        self.dispatch(ctx, message)
      }
  }
}

///|
pub fn install_prefix(
  bot : @discord.Bot,
  cache : @wandbox.LanguageCache,
  renderer : @texrender.TexRenderer,
  users : @state.OptOutUsers,
) -> Unit {
  let feature = PrefixFeature(cache, renderer, users)
  bot.on(@discord.Events::message_create(), (ctx, event) => {
    feature.dispatch(ctx, event.message)
  })
  bot.on(@discord.Events::message_update(), (ctx, event) => {
    feature.on_update(ctx, event)
  })
}
