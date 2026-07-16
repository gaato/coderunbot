///|
fn tex_args() -> @discord.Args[Unit] {
  @discord.Args::map2(
    @discord.arg_string(name="env", description="The environment to use", choices=[
      @discord.string_choice("align", "align"),
      @discord.string_choice("gather", "gather"),
    ]).optional(),
    @discord.arg_bool(
      name="spoiler",
      description="Whether to mark the image as a spoiler",
    ).with_default(false),
    (_, _) => (),
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
  app.command(
    @discord.slash(
      name="tex",
      description="TeX to image",
      args=tex_args(),
      handler=Raw(ctx => {
        let environment = ctx.options.string_opt("env")
        let spoiler = ctx.options.bool_opt("spoiler").unwrap_or(false)
        let value = match environment {
          Some(name) => "\\begin{\{name}}\n\n\\end{\{name}}"
          None => ""
        }
        ctx.show_modal(custom_id="texm:\{spoiler}", title="LaTeX to Image", components=[
          @discord.label(
            label="Code",
            component=@discord.text_input(
              custom_id="code",
              style=Paragraph,
              placeholder="Input TeX code here",
              value~,
            ),
          ),
        ])
      }),
    ),
  )
  app.on_modal_raw(prefix="texm:", ctx => {
    ctx.defer_response(ephemeral=false)
    let spoiler = ctx.data.custom_id.strip_prefix("texm:") == Some("true")
    let code = ctx.text_value("code").unwrap_or("")
    let output = render_tex(renderer, ctx.user().username, code, spoiler)
      |> @texrender.append_code_field(code)
    ctx.followup(embeds=[output.embed], files=uploads(output.files), components=[
      @core.delete_row(ctx.user().id.value()),
    ])
    |> ignore
  })
}
