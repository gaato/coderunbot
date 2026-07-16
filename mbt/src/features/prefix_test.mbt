///|
test "fence stripping removes fenced marker lines" {
  inspect(
    @features.strip_fences("```python\nprint('x')\n```"),
    content="print('x')",
  )
  inspect(@features.strip_fences("before\n```\nafter"), content="before\nafter")
  inspect(@features.strip_tex_fences("```x^2``` "), content="x^2")
}

///|
test "prefix parser handles run tex and stex" {
  debug_inspect(
    @features.parse_prefix("]run Cpp ```cpp\nint main() {}\n```").unwrap(),
    content="Run(language=\"Cpp\", code=\"int main() {}\")",
  )
  debug_inspect(
    @features.parse_prefix("]tex x^2").unwrap(),
    content="Tex(code=\"x^2\", spoiler=false)",
  )
  debug_inspect(
    @features.parse_prefix("]stex y").unwrap(),
    content="Tex(code=\"y\", spoiler=true)",
  )
  debug_inspect(
    @features.parse_prefix("]tex ```x^2``` ").unwrap(),
    content="Tex(code=\"x^2\", spoiler=false)",
  )
  assert_true(@features.parse_prefix("hello") is None)
}
