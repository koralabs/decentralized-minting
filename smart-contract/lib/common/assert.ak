pub fn assert(predicate: Bool, message: String) -> Void {
  if !predicate {
    fail message
  } else {
    Void
  }
}
