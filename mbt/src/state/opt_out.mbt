///|
pub fn parse_opt_out_users(value : String) -> Array[UInt64] raise {
  let users : Map[UInt64, Unit] = Map([])
  for line in value.split("\n") {
    let item = line.trim()
    if !item.is_empty() {
      users[@string.parse_uint64(item)] = ()
    }
  }
  let result = users.keys().collect()
  result.sort()
  result
}

///|
pub fn serialize_opt_out_users(users : ArrayView[UInt64]) -> String {
  let unique : Map[UInt64, Unit] = Map([])
  for user in users {
    unique[user] = ()
  }
  let sorted = unique.keys().collect()
  sorted.sort()
  let out = StringBuilder()
  for user in sorted {
    out <+ "\{user}\n"
  }
  out.to_string()
}

///|
pub struct OptOutUsers {
  priv state_ : TextState
  priv users_ : Map[UInt64, Unit]
  priv mutex_ : @async.Mutex
}

///|
pub async fn load_opt_out_users(state : TextState) -> OptOutUsers {
  let users : Map[UInt64, Unit] = Map([])
  for user in parse_opt_out_users(state.read()) {
    users[user] = ()
  }
  { state_: state, users_: users, mutex_: Mutex() }
}

///|
pub async fn OptOutUsers::contains(
  self : OptOutUsers,
  user_id : UInt64,
) -> Bool {
  self.mutex_.acquire()
  defer self.mutex_.release()
  self.users_.contains(user_id)
}

///|
async fn OptOutUsers::save_locked(self : OptOutUsers) -> Unit {
  self.state_.write(serialize_opt_out_users(self.users_.keys().collect()))
}

///|
pub async fn OptOutUsers::add(self : OptOutUsers, user_id : UInt64) -> Unit {
  self.mutex_.acquire()
  defer self.mutex_.release()
  self.users_[user_id] = ()
  self.save_locked()
}

///|
pub async fn OptOutUsers::remove(self : OptOutUsers, user_id : UInt64) -> Unit {
  self.mutex_.acquire()
  defer self.mutex_.release()
  self.users_.remove(user_id)
  self.save_locked()
}
