///|
test "bounded map evicts the oldest entry" {
  let values : @core.BoundedMap[Int, String] = BoundedMap(limit=2)
  values.set(1, "one")
  values.set(2, "two")
  values.set(3, "three")
  assert_false(values.contains(1))
  assert_eq(values.get(2), Some("two"))
  assert_eq(values.get(3), Some("three"))
  assert_eq(values.length(), 2)
}

///|
test "delete ids encode and authorize the requester" {
  inspect(@core.delete_custom_id(42UL), content="del:42")
  assert_true(@core.delete_authorized("del:42", 42UL))
  assert_false(@core.delete_authorized("del:42", 7UL))
  assert_false(@core.delete_authorized("other:42", 42UL))
}

///|
test "escape mentions matches Pycord mention classes" {
  inspect(
    @core.escape_mentions(
      "@everyone @here <@12345678901234567> <@!123456789012345678> <@&1234567890123456789> <#123456789012345678>",
    ),
    content="@​everyone @​here <@​12345678901234567> <@​!123456789012345678> <@​&1234567890123456789> <#123456789012345678>",
  )
}

///|
test "escape markdown preserves URLs and escapes stock syntax" {
  inspect(
    @core.escape_markdown(
      "**bold** _x_ https://example.test/a_b?q=*x*\n> quote\n[text](target)",
    ),
    content="\\*\\*bold\\*\\* \\_x\\_ https://example.test/a_b?q=*x*\n\\> quote\n\\[text](target)",
  )
}
