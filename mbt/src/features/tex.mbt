///|
priv struct TexArgs {
  environment : String?
  spoiler : Bool
}

///|
priv struct TexForm {
  code : String
}

///|
fn tex_args() -> @discord.Args[TexArgs] {
  @discord.Args::map2(
    @discord.arg_string(name="env", description="The environment to use", choices=[
      @discord.string_choice("align", "align"),
      @discord.string_choice("gather", "gather"),
    ]).optional(),
    @discord.arg_bool(
      name="spoiler",
      description="Whether to mark the image as a spoiler",
    ).with_default(false),
    (environment, spoiler) => { environment, spoiler },
  )
}

///|
fn tex_modal() -> @discord.Modal[TexForm] {
  @discord.modal(
    custom_id="texm",
    title="LaTeX to Image",
    fields=@discord.ModalFields::map1(
      @discord.text_field(
        custom_id="code",
        label="Code",
        style=Paragraph,
        placeholder="Input TeX code here",
      ),
      code => { code, },
    ),
  )
}

///|
fn tex_error_message(error : Error) -> String {
  match error {
    @texrender.TexWorkerError::Render(message) => message
    other => "\{to_repr(other)}"
  }
}

///|
pub async fn render_tex(
  renderer : @texrender.TexRenderer,
  author_name : String,
  code : String,
  spoiler : Bool,
) -> @texrender.TexOutput {
  @texrender.render_success(author_name, code, spoiler, renderer.render(code)) catch {
    error => @texrender.render_error(author_name, tex_error_message(error))
  }
}

///|
pub fn install_tex(
  app : @discord.App,
  renderer : @texrender.TexRenderer,
) -> Unit {
  let modal = tex_modal()
  app.command(
    @discord.slash(
      name="tex",
      description="TeX to image",
      args=tex_args(),
      handler=Immediate((_, args) => {
        let value = match args.environment {
          Some(name) => "\\begin{\{name}}\n\n\\end{\{name}}"
          None => ""
        }
        ShowModal(modal.show(state="\{args.spoiler}", values={ "code": value }))
      }),
    ),
  )
  app.on_modal(
    modal,
    Deferred(ephemeral=false, (ctx, form) => {
      let spoiler = ctx.state() == Some("true")
      let output = render_tex(renderer, ctx.user().username, form.code, spoiler)
        |> @texrender.append_code_field(form.code)
      ctx.followup(embeds=[output.embed], files=uploads(output.files), components=[
        @core.delete_row(ctx.user().id.value()),
      ])
      |> ignore
    }),
  )
}
