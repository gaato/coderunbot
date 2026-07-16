///|
const WANDBOX_LIST_URL : String = "https://wandbox.org/api/list.json"

///|
const CACHE_TTL_MS : UInt64 = 600000UL

///|
pub(all) struct CompilerInfo {
  name : String
  language : String
} derive(FromJson, Debug, Eq)

///|
pub fn normalize_language(value : String) -> String {
  value.to_lower().replace_all(old=" ", new="")
}

///|
pub fn expand_language_alias(value : String) -> String {
  value
  .to_lower()
  .replace_all(old="pp", new="++")
  .replace_all(old="sharp", new="#")
  .replace_all(old="clisp", new="lisp")
}

///|
fn is_unstable_compiler(name : String) -> Bool {
  let value = name.to_lower()
  value.contains("head") || value.contains("devel") || value.contains("git")
}

///|
pub fn select_compilers(
  entries : ArrayView[CompilerInfo],
) -> Map[String, String] {
  let selected : Map[String, String] = Map([])
  for entry in entries {
    let language = normalize_language(entry.language)
    match selected.get(language) {
      None => selected[language] = entry.name
      Some(current) if is_unstable_compiler(current) &&
        !is_unstable_compiler(entry.name) => selected[language] = entry.name
      _ => ()
    }
  }
  selected
}

///|
async fn fetch_compilers() -> Map[String, String] {
  let (response, body) = @ahttp.get(WANDBOX_LIST_URL)
  if response.code < 200 || response.code >= 300 {
    raise WandboxError::Http(status=response.code, reason=response.reason)
  }
  let entries : Array[CompilerInfo] = @json.from_json(body.json())
  select_compilers(entries)
}

///|
pub struct LanguageCache {
  priv mut compilers_ : Map[String, String]
  priv mut expires_at_ : UInt64
  priv mutex_ : @async.Mutex
}

///|
pub fn LanguageCache::LanguageCache() -> LanguageCache {
  { compilers_: Map([]), expires_at_: 0UL, mutex_: Mutex() }
}

///|
pub async fn LanguageCache::compilers(
  self : LanguageCache,
) -> Map[String, String] {
  self.mutex_.acquire()
  defer self.mutex_.release()
  if self.compilers_.is_empty() || @env.now() >= self.expires_at_ {
    self.compilers_ = fetch_compilers()
    self.expires_at_ = @env.now() + CACHE_TTL_MS
  }
  self.compilers_.copy()
}

///|
pub async fn LanguageCache::warm(self : LanguageCache) -> Unit {
  self.compilers() |> ignore
}

///|
pub async fn LanguageCache::language_names(
  self : LanguageCache,
) -> Array[String] {
  let names = self.compilers().keys().collect()
  names.sort()
  names
}
