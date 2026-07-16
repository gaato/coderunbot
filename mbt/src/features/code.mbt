///|
priv struct RunForm {
  code : String
  stdin : String?
}

///|
fn run_modal() -> @discord.Modal[RunForm] {
  @discord.modal(
    custom_id="runm",
    title="Run code",
    fields=@discord.ModalFields::map2(
      @discord.text_field(
        custom_id="code",
        label="Code",
        style=Paragraph,
        placeholder="Write code here",
      ),
      @discord.text_field(
        custom_id="stdin",
        label="Standard Input",
        style=Paragraph,
      ).optional(),
      (code, stdin) => { code, stdin },
    ),
  )
}

///|
fn language_argument(cache : @wandbox.LanguageCache) -> @discord.Arg[String] {
  @discord.arg_string(name="language", description="Language", suggest=(
    _,
    input,
  ) => {
    let query = @wandbox.normalize_language(input)
    let choices : Array[@model.CommandOptionChoice] = []
    let names = cache.language_names() catch { _ => [] }
    for name in names {
      if choices.length() >= 25 {
        break
      }
      if query.is_empty() || name.has_prefix(query) {
        choices.push(@discord.string_choice(name, name))
      }
    }
    choices
  })
}

///|
fn uploads(files : ArrayView[@core.OutputFile]) -> Array[@dhttp.FileUpload] {
  files.map(file => file.to_upload())
}

///|
pub async fn run_code(
  cache : @wandbox.LanguageCache,
  author_name : String,
  language : String,
  code : String,
  stdin? : String = "",
) -> @wandbox.RunOutput {
  let normalized = @wandbox.normalize_language(language)
  @wandbox.run(cache, author_name, normalized, code, stdin~)
}

///|
pub fn install_code(app : @discord.App, cache : @wandbox.LanguageCache) -> Unit {
  let modal = run_modal()
  app.command(
    @discord.slash(
      name="run",
      description="Run code",
      args=@discord.Args::map1(language_argument(cache), language => language),
      handler=Immediate((_, language) => {
        ShowModal(modal.show(state=@wandbox.expand_language_alias(language)))
      }),
    ),
  )
  app.on_modal(
    modal,
    Deferred(ephemeral=false, (ctx, form) => {
      let language = ctx.state().unwrap_or("")
      let output = run_code(
          cache,
          ctx.user().username,
          language,
          form.code,
          stdin=form.stdin.unwrap_or(""),
        )
        |> @wandbox.append_code_field(language, form.code)
      ctx.followup(embeds=[output.embed], files=uploads(output.files), components=[
        @core.delete_row(ctx.user().id.value()),
      ])
      |> ignore
    }),
  )
  app.command(
    @discord.message_command(
      name="escape",
      handler=Immediate((_, message) => {
        @discord.CommandReply::message(
          content=@core.escape_markdown(@core.escape_mentions(message.content)),
          ephemeral=true,
        )
      }),
    ),
  )
}
