///|
pub async fn log_error(
  client : @dhttp.Client,
  context : String,
  error : Error,
) -> Unit {
  let error_text = "\{to_repr(error)}"
  try
    client.create_message(Id(LOG_CHANNEL_ID), content="```\n\{context}\n```", files=[
      FileUpload("error.txt", @utf8.encode(error_text)),
    ])
    |> ignore
  catch {
    send_error => {
      println("[error] failed to send error log: \{to_repr(send_error)}")
      println("[error] context: \{context}")
      println(error_text)
    }
  }
}
