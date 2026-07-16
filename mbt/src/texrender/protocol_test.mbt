///|
test "texworker protocol encodes requests and decodes responses" {
  inspect(
    @texrender.encode_request(7, "x^2"),
    content="{\"id\":7,\"latex\":\"x^2\"}",
  )
  debug_inspect(
    @texrender.decode_response("{\"id\":7,\"ok\":true,\"png\":\"cG5n\"}"),
    content="{ id: 7, ok: true, png: Some(\"cG5n\"), error: None }",
  )
  debug_inspect(
    @texrender.decode_response("{\"id\":8,\"ok\":false,\"error\":\"bad tex\"}"),
    content="{ id: 8, ok: false, png: None, error: Some(\"bad tex\") }",
  )
}
