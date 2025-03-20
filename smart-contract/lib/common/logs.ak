pub fn fail_if_false(predicate: Bool, message: String) -> Void {
  if !predicate {
    fail message
  } else {
    Void
  }
}
