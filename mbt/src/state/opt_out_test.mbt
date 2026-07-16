///|
test "opt-out parse and serialize round trip" {
  let parsed = @state.parse_opt_out_users("42\n7\n42\n\n100\n")
  debug_inspect(parsed, content="[7, 42, 100]")
  inspect(
    @state.serialize_opt_out_users(parsed),
    content=(
      #|7
      #|42
      #|100
      #|
    ),
  )
  assert_eq(
    @state.parse_opt_out_users(@state.serialize_opt_out_users(parsed)),
    parsed,
  )
}
