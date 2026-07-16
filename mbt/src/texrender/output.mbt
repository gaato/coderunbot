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
    fields.push({
      name: "Hint",
      value: "You can use gather or align environment.",
      inline: None,
    })
  }
  let image_url = if spoiler { None } else { Some("attachment://tex.png") }
  {
    embed: @core.embed(color=0x008000, author_name~, image_url?, fields~),
    files: [{ name: "tex.png", content: png, spoiler }],
  }
}

///|
pub fn render_error(author_name : String, message : String) -> TexOutput {
  {
    embed: @core.embed(
      title="Rendering Error",
      description="```\n\{message}\n```",
      color=0xFF0000,
      author_name~,
    ),
    files: [],
  }
}

///|
pub fn append_code_field(output : TexOutput, code : String) -> TexOutput {
  {
    ..output,
    embed: @core.add_embed_field(output.embed, "Code", "```tex\n\{code}\n```"),
  }
}
