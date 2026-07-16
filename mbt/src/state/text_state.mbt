///|
pub(all) suberror StateError {
  Http(status~ : Int, reason~ : String)
} derive(Debug)

///|
pub struct TextState {
  priv par_url_ : String?
  priv local_path_ : String
}

///|
pub fn TextState::TextState(
  local_path~ : String,
  par_url? : String,
) -> TextState {
  let par_url = match par_url {
    Some(value) if !value.trim().is_empty() => Some(value)
    _ => None
  }
  { par_url_: par_url, local_path_: local_path }
}

///|
pub fn TextState::from_env() -> TextState {
  TextState(
    local_path=@env.get_env_var("OPT_OUT_FILE").unwrap_or(
      "./data/opt-out-users.txt",
    ),
    par_url?=@env.get_env_var("OPT_OUT_PAR_URL"),
  )
}

///|
fn parent_directory(path : String) -> String {
  match path.rev_find("/") {
    Some(0) => "/"
    Some(index) => path[:index].to_owned()
    None => "."
  }
}

///|
pub async fn TextState::read(self : TextState) -> String {
  match self.par_url_ {
    Some(url) => {
      let (response, body) = @ahttp.get(url)
      if response.code == 404 {
        ""
      } else if response.code >= 200 && response.code < 300 {
        body.text()
      } else {
        raise StateError::Http(status=response.code, reason=response.reason)
      }
    }
    None =>
      if @fs.exists(self.local_path_) {
        @fs.read_file(self.local_path_).text()
      } else {
        ""
      }
  }
}

///|
pub async fn TextState::write(self : TextState, value : String) -> Unit {
  match self.par_url_ {
    Some(url) => {
      let (response, _) = @ahttp.put(url, value, headers={
        "Content-Type": "text/plain; charset=utf-8",
      })
      if response.code < 200 || response.code >= 300 {
        raise StateError::Http(status=response.code, reason=response.reason)
      }
    }
    None => {
      @fs.mkdir(parent_directory(self.local_path_), recursive=true)
      @fs.write_file(self.local_path_, value, create_mode=CreateOrTruncate)
    }
  }
}
