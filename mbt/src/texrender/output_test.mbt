///|
test "tex code field is added only by modal decoration" {
  let success = @texrender.render_success("tester", "x^2", false, b"png")
  guard success.embed.fields is Some(success_fields) else {
    fail("missing success fields")
  }
  assert_eq(success_fields.length(), 0)
  let failure = @texrender.render_error("tester", "bad tex")
  assert_true(failure.embed.fields is None)
  let decorated = @texrender.append_code_field(failure, "x^")
  guard decorated.embed.fields is Some(decorated_fields) else {
    fail("missing decorated fields")
  }
  assert_eq(decorated_fields.length(), 1)
  assert_eq(decorated_fields[0].name, "Code")
}
