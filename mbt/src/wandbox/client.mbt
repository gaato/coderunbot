///|
const WANDBOX_COMPILE_URL : String = "https://wandbox.org/api/compile.json"

///|
const NIM_OPTIONS : String = "--hint[Processing]:off\n--hint[Conf]:off\n--hint[Link]:off\n--hint[SuccessX]:off"

///|
priv struct CompileRequest {
  compiler : String
  code : String
  stdin : String
  compiler_option_raw : String
} derive(ToJson(fields(compiler_option_raw(rename="compiler-option-raw"))))

///|
fn preview(value : String, max_chars : Int) -> String {
  let chars = value.to_array()
  if chars.length() <= max_chars {
    return value
  }
  let out = StringBuilder()
  for i in 0..<max_chars {
    out <+ "\{chars[i]}"
  }
  out <+ "..."
  out.to_string()
}

///|
pub async fn run(
  cache : LanguageCache,
  author_name : String,
  language : String,
  code : String,
  stdin? : String = "",
) -> RunOutput {
  let normalized = normalize_language(language)
  let compilers = cache.compilers() catch {
    error =>
      return error_output("Connection Error", "\{to_repr(error)}", author_name)
  }
  guard compilers.get(normalized) is Some(compiler) else {
    let names = compilers.keys().collect()
    names.sort()
    return error_output(
      "The following languages are supported",
      names.join(", "),
      author_name,
    )
  }
  let request = CompileRequest::{
    compiler,
    code,
    stdin,
    compiler_option_raw: if normalized == "nim" {
      NIM_OPTIONS
    } else {
      ""
    },
  }
  let (response, body) = @ahttp.post(
    WANDBOX_COMPILE_URL,
    ToJson::to_json(request),
    headers={ "Content-Type": "application/json" },
  ) catch {
    error =>
      return error_output("Connection Error", "\{to_repr(error)}", author_name)
  }
  if response.code < 200 || response.code >= 300 {
    return error_output(
      "Connection Error",
      response.code.to_string(),
      author_name,
    )
  }
  let json = body.json() catch {
    _ =>
      return error_output(
        "Wandbox Error",
        "Wandbox returned a non-JSON response. Check the service status or your request.\n\nResponse Preview\n```\n\{preview(body.text() catch { _ => "" }, 750)}\n```",
        author_name,
      )
  }
  map_result(json, normalized, compiler, author_name) catch {
    error => error_output("Wandbox Error", "\{to_repr(error)}", author_name)
  }
}
