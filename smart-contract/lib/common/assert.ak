pub fn assert(predicate: Bool, message: String) -> Void {
  if !predicate {
    fail message
  } else {
    Void
  }
}

pub fn unwrap_option(option: Option<a>, message: String) -> a {
  when option is {
    Some(value) -> value
    None -> fail message
  }
}
