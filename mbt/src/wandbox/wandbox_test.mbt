///|
let list_fixture : String =
  #|[
  #|  { "name": "gcc-head", "language": "C++" },
  #|  { "name": "gcc-14.2", "language": "C++" },
  #|  { "name": "cpp-1.0", "language": "CPP" },
  #|  { "name": "nim-git", "language": "Nim" },
  #|  { "name": "nim-2.2.0", "language": "Nim" },
  #|  { "name": "cpython-3.13.1", "language": "Python" }
  #|]

///|
test "language normalization follows coderunbot aliases" {
  inspect(@wandbox.normalize_language("C PP"), content="cpp")
  inspect(@wandbox.expand_language_alias("Cpp"), content="c++")
  inspect(@wandbox.expand_language_alias("FSharp"), content="f#")
  inspect(@wandbox.expand_language_alias("Common CLisp"), content="common lisp")
}

///|
test "compiler selection prefers stable entries from list fixture" {
  let entries : Array[@wandbox.CompilerInfo] = @json.from_json(
    @json.parse(list_fixture),
  )
  let selected = @wandbox.select_compilers(entries)
  inspect(selected["c++"], content="gcc-14.2")
  inspect(selected["cpp"], content="cpp-1.0")
  assert_false(selected["cpp"] == selected["c++"])
  inspect(selected["nim"], content="nim-2.2.0")
  inspect(selected["python"], content="cpython-3.13.1")
}

///|
test "result mapping filters Nim CC lines and sets success color" {
  let output = @wandbox.map_result(
    @json.parse(
      (
        #|{"status":"0","compiler_error":"CC: cache/file.c\nreal warning\n","program_output":"ok","program_message":"ignored"}
      ),
    ),
    "nim",
    "nim-2.2.0",
    "tester",
  )
  assert_eq(output.embed.color, Some(0x007000))
  guard output.embed.fields is Some(fields) else { fail("missing fields") }
  assert_eq(fields.length(), 3)
  assert_false(fields.any(field => field.name == "Code"))
  assert_true(fields[1].value.contains("real warning"))
  assert_false(fields[1].value.contains("CC:"))
  assert_eq(output.files.length(), 0)
  let decorated = @wandbox.append_code_field(output, "nim", "echo 42")
  guard decorated.embed.fields is Some(decorated_fields) else {
    fail("missing decorated fields")
  }
  assert_eq(decorated_fields.length(), 4)
  assert_eq(decorated_fields[3].name, "Code")
}

///|
test "result mapping moves long output to a text file" {
  let long = "x".repeat(1001).to_string()
  let output = @wandbox.map_result(
    { "status": "1", "program_output": long },
    "python",
    "cpython",
    "tester",
  )
  assert_eq(output.embed.color, Some(0xFF0000))
  assert_eq(output.files.length(), 1)
  assert_eq(output.files[0].name, "program_output.txt")
}
