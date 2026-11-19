inputs <- c("42.4", "42", "", "abc", "5a")

for (input in inputs) {

  if (grepl("^[0-9]{1,5}$", input)) {
    # it's an integer
    parsed <- as.integer(input)
  } else if (grepl("^[0-9]{1,5}\\.[0-9]{1,3}$", input)) {
    # it's a double
    parsed <- as.double(input)
  } else {
    # it's neither
    parsed <- "NaN"
  }

  parsed #type=parsed#

  if (is.double(parsed)) {
    num <- parsed
  } else {
    num <- 0
  }

  num #type=double#
  if (is.double(num)) {
    num #type=obviousdouble#
  } else {
    num #type=bottom#
    stop("unreachable")
  }
}
