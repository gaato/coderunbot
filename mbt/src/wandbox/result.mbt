///|
pub(all) suberror WandboxError {
  Http(status~ : Int, reason~ : String)
  InvalidResponse(String)
} derive(Debug)

///|
pub(all) struct RunOutput {
  embed : @model.Embed
  files : Array[@core.OutputFile]
} derive(Debug)

///|
fn count_lines(value : String) -> Int {
  value.split("\n").count()
}

///|
pub fn filter_nim_compiler_error(value : String) -> String {
  value
  .split("\n")
  .filter(line => !line.has_prefix("CC: "))
  .collect()
  .join("\n")
}

///|
fn json_value_text(value : Json) -> String {
  match value {
    String(text) => text
    other => other.stringify()
  }
}

///|
pub fn map_result(
  result : Json,
  language : String,
  compiler : String,
  author_name : String,
) -> RunOutput raise WandboxError {
  guard result is Object(values) else {
    raise InvalidResponse("expected a JSON object")
  }
  let fields : Array[@model.EmbedField] = []
  let files : Array[@core.OutputFile] = []
  let mut color = 0xFF0000
  for key, raw in values {
    if key == "program_message" || key == "compiler_message" {
      continue
    }
    let mut value = json_value_text(raw)
    if value.is_empty() {
      continue
    }
    if key == "status" && value == "0" {
      color = 0x007000
    }
    if language == "nim" && key == "compiler_error" {
      value = filter_nim_compiler_error(value)
      if value.is_empty() {
        continue
      }
    }
    if value.length() > 1000 || count_lines(value) > 100 {
      files.push({
        name: "\{key}.txt",
        content: @utf8.encode(value),
        spoiler: false,
      })
    } else {
      fields.push({ name: key, value: "```\n\{value}\n```", inline: None })
    }
  }
  {
    embed: @core.embed(
      title="Result (\{compiler}):",
      color~,
      author_name~,
      fields~,
    ),
    files,
  }
}

///|
pub fn error_output(
  title : String,
  description : String,
  author_name : String,
) -> RunOutput {
  {
    embed: @core.embed(title~, description~, color=0xFF0000, author_name~),
    files: [],
  }
}

///|
pub fn append_code_field(
  output : RunOutput,
  language : String,
  code : String,
) -> RunOutput {
  {
    ..output,
    embed: @core.add_embed_field(
      output.embed,
      "Code",
      "```\{language}\n\{code}\n```",
    ),
  }
}
