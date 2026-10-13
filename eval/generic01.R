f <- function() { return 0 }

t <- function(x) { return 1L }
a1 <- t(1)
a2 <- t(f)
a1 #type=int1#
a2 #type=int2#

t.default <- t
t.function <- function(x) { return "f" }
b1 <- t(1)
b2 <- t(f)
b1 #type=int3#
b2 #type=int4#

t <- function(x, ...) UseMethod("t", x)
c1 <- t(1)
c2 <- t(f)
c1 #type=int5#
c2 #type=str#
