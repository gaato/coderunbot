///|
pub struct BoundedMap[K, V] {
  priv values_ : Map[K, V]
  priv limit_ : Int
}

///|
pub fn[K : Hash + Eq, V] BoundedMap::BoundedMap(
  limit~ : Int,
) -> BoundedMap[K, V] {
  { values_: Map([]), limit_: limit.max(0) }
}

///|
pub fn[K : Hash + Eq, V] BoundedMap::get(
  self : BoundedMap[K, V],
  key : K,
) -> V? {
  self.values_.get(key)
}

///|
pub fn[K : Hash + Eq, V] BoundedMap::contains(
  self : BoundedMap[K, V],
  key : K,
) -> Bool {
  self.values_.contains(key)
}

///|
pub fn[K, V] BoundedMap::length(self : BoundedMap[K, V]) -> Int {
  self.values_.length()
}

///|
pub fn[K : Hash + Eq, V] BoundedMap::remove(
  self : BoundedMap[K, V],
  key : K,
) -> Unit {
  self.values_.remove(key)
}

///|
pub fn[K : Hash + Eq, V] BoundedMap::set(
  self : BoundedMap[K, V],
  key : K,
  value : V,
) -> Unit {
  self.values_[key] = value
  while self.values_.length() > self.limit_ {
    let mut oldest : K? = None
    for existing, _ in self.values_ {
      oldest = Some(existing)
      break
    }
    match oldest {
      Some(existing) => self.values_.remove(existing)
      None => break
    }
  }
}
