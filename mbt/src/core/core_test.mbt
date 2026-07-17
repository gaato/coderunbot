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
