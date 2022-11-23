---
layout: post
title:  "The Power of Go Benchmarking"
date:   2022-11-22 08:00 -0700
categories: blog
---

My team at Google holds a weekly learning session where folks take
turns teaching the team team something new. Last week, I gave a talk about
some, at times surprising, behaviors in golang. It is very much based on the
format of a 2016 talk by
[Dave Cheney](https://github.com/davecheney)
titled [Gopher Puzzlers](https://www.youtube.com/watch?v=dJCV90Yee1o).
I use the format of presenting brainteasers about a
language as I find it is engaging and facilitates further, deeper,
conversations on my team.

One of the areas I covered were some lesser used features of go slices.
One of the code fragments introduces `make`, with an *additional* argument.

```go
package main

import "fmt"

func main() {
    s := make([]int, 0, 5)
    fmt.Println(len(s))
}
```

A usual reaction to seeing this is "Wait, I can provide a third argument to
make?" and "Why?". It was fortunate timing that the next workday a coworker
requested requested a code review that offered an opportunity to demonstrate
a reason you might just use this additional arg.

## A motivating example

Our service needed to call another that takes a slice of ints (`[]int`).
Unfortunately our code stores that data as `[]string`, so we'd need to convert.
No matter, it is rather straightforward to do so:

```go
// Given a slice of strings, convert to a slice of ints.
func Convert(src []string) []int {
	var dst []int
	for _, s := range src {
		d, _ := strconv.Atoi(s)
		dst = append(dst, d)
	}
	return dst
}
```

The code above is simplified (removes some error handling for instance), but
demonstrates the idea. We iterate over the string slice, appending to an int
slice until we have converted all elements.

When I saw this in the review, I saw an opportunity:

1. To demonstrate a way in which we can use that third arg to our benefit.
2. To use benchmarks and share some of the ways I use them in my work.

## Specifying Slice Capacity via `make`

If we head over to the [pkg.go.dev](https://pkg.go.dev/builtin#make) we can see that a second int can be provided to specify a capacity, not just a size.

From [pkg.go.dev](https://pkg.go.dev/builtin#make):

    The size specifies the length. The capacity of the slice
    is equal to its length. A second integer argument may be
    provided to specify a different capacity;

So what is capacity? This allows us to tell Go that, while not yet of a larger
size, we expect this slice to grow to a certain capacity. By letting Go know
this, it can make better choices when allocating memory, and avoid having to
reallocate the slice at a later point. This can often result in substantial
speed improvements. And this is where benchmarking comes in!

## Benchmarking

Most of the time I think it's probably best not to be clever. After all, while
it's best to be smart about how much work we ask computers to do, they are
very good at their jobs. And we should avoid premature optimization at the
expense of readability. All that said, it can be useful at times to better
understand the performance of the code we author. And that is where
benchmarking comes in.

Let't start by authoring a simple benchmark. Becnhmarks can be included in
`*_test.go` files.

```go
// testList is a []int with 1500 elements.
var testList []string

func BenchmarkConvert(b *testing.B) {
	for n := 0; n < b.N; n++ {
		Convert(testList)
	}
}
```

We can then run our benchmark using `go test -bench .`. I like to also include
the `-benchmem` arg for a bit of extra detail.

```
❯ go test -benchmem -bench .
goos: darwin
goarch: arm64
pkg: FunWithBenchmarks
BenchmarkConvert-8    124845   9148 ns/op   39544 B/op   13 allocs/op
PASS
ok  	FunWithBenchmarks
```

The above output contains a few different outputs. From left to right:

- Number of times looped: 124845
- Time per operation: 9148 ns/op
- Bytes per operation: 39,544 B/op
- Allocations per operation: 13 allocs/op

### Comparing

We are not using all of the information we have in the initial code sample.
Due to converting an existing slice to a slice of the same size, we can make an
optimation either by:

1. Setting a capacity. This is a very small change to the code fragment that
   should net a performance gain.

2. We could consider setting the size of the list, and using indexed inserts.
   If you are familiar with other programming languages, this likely seems
   similar to methods you may have used before.

Now that we know about benchmarking, let's use it to compare these comparable,
but different, ways of converting a string slice to an int slice.

```go
// Given a slice of strings, convert to a slice of ints. Use append, but
// preallocate the capacity of the destination list to match the length of
// the source list.
func ConvertWithCapacity(src []string) []int {
	dst := make([]int, 0, len(src))
	for _, s := range src {
		d, _ := strconv.Atoi(s)
		dst = append(dst, d)
	}
	return dst
}

// Given a slice of strings, convert to a slice of ints. Don't append, update
// each item by indexing into destination slice.
func ConvertWithSize(src []string) []int {
	dst := make([]int, len(src))
	for i, s := range src {
		d, _ := strconv.Atoi(s)
		dst[i] = d
	}
	return dst
}
```

### So, what is faster?

It will come as no surprise that the original, `Convert`, isn't the fastest.
In fact it is the least fast version. But how do the other two options compare?

<!-- 
Here is the full benchmark test:

```go
var testList []string

func init() {
	for i := 0; i < 1500; i++ {
		testList = append(testList, fmt.Sprint(i))
	}
}

func BenchmarkConvert(b *testing.B) {
	for n := 0; n < b.N; n++ {
		Convert(testList)
	}
}

func BenchmarkConvertWithCapacity(b *testing.B) {
	for n := 0; n < b.N; n++ {
		ConvertWithCapacity(testList)
	}
}

func BenchmarkConvertWithSize(b *testing.B) {
	for n := 0; n < b.N; n++ {
		ConvertWithSize(testList)
	}
}
```
-->


```sh
❯ go test -benchmem -bench .
goos: darwin
goarch: arm64
pkg: FunWithBenchmarks
BenchmarkConvert-8              124845   9148 ns/op   39544 B/op   13 allocs/op
BenchmarkConvertWithCapacity-8  170178   7158 ns/op   12288 B/op    1 allocs/op
BenchmarkConvertWithSize-8      187666   6603 ns/op   12288 B/op    1 allocs/op
PASS
ok  	FunWithBenchmarks	3.947s
```

Our change to set the capacity, which should result in less allocations, does
seem to have resulted in some decent gains. We are able to reduce 13 allocs to
1 alloc, and the runtime is reduced by a little more than 20%. This could be
considerable timesavings depending on the size of the slice being converted.

Similarly, `ConvertWithSize` is faster than `Convert`. It isn't a large
difference compared to `ConvertWithCapacity`, but it is a 27% or so of improvement in runtime.

## Summary

While it is generally best to not optimize prematurely, there are often times
we assume which way of doing an operation will be faster. This is further
complicated by modern compilers that do optimize codepaths for us at times, so
sometimes the seemingly slower way could end up being faster as a language like
Go will know how to optimize it.

I think that with as easy as it is to write
benchmarks, it makes sense to take a moment and inspect those assumptions;
every once in a while we stumble upon a hidden gem.

If you'd like to read more about Go Benchmarks the
[Go Testing Documentation](https://pkg.go.dev/testing#hdr-Benchmarks) is pretty
thorough and not too dense. I barely scratched the surface and you will find
additional options and ways of composing benchmarks.
