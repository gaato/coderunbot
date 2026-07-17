///|
pub(all) struct TexOutput {
  embed : @model.Embed
  files : Array[@core.OutputFile]
} derive(Debug)

///|
pub fn render_success(
  author_name : String,
  code : String,
  spoiler : Bool,
  png : Bytes,
) -> TexOutput {
  let fields : Array[@model.EmbedField] = []
  if code.contains("\\\\") &&
    !code.contains("\\begin") &&
    !code.contains("\\end") {
    fields.push(
      @model.EmbedField("Hint", "You can use gather or align environment."),
    )
  }
  let image = if spoiler {
    None
  } else {
    Some(@model.EmbedImage("attachment://tex.png"))
  }
  {
    embed: @model.Embed(
      color=0x008000,
      image?,
      author=@model.EmbedAuthor(author_name),
      fields~,
    ),
    files: [{ name: "tex.png", content: png, spoiler }],
  }
}

///|
pub fn render_error(author_name : String, message : String) -> TexOutput {
  {
    embed: @model.Embed(
      title="Rendering Error",
      description="```\n\{message}\n```",
      color=0xFF0000,
      author=@model.EmbedAuthor(author_name),
    ),
    files: [],
  }
}

///|
pub fn append_code_field(output : TexOutput, code : String) -> TexOutput {
  let fields = output.embed.fields.unwrap_or([]).copy()
  fields.push(@model.EmbedField("Code", "```tex\n\{code}\n```"))
  { ..output, embed: { ..output.embed, fields: Some(fields) } }
}
