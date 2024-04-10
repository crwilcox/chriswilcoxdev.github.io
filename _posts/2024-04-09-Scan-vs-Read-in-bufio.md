---
layout: post
title:  "Comparing the use of `bufio.Scanner` and `bufio.Reader`"
date:   2024-04-09 08:00 -0700
categories: blog
---


I recently came across an issue in our codebase and, while there is some
discussion out there already, I couldn't find anywhere that spelled out some of
the differences between using Golang's `bufio.NewScanner` and
`bufio.NewReader`. So I wrote a short bit up to share.

## bufio.Scanner

Let's start by looking at a code fragment. This is roughly what is in our
source code, though a bit more generic.

```golang
// When reading large files, we have been hit by the max token size limit
// that stems from the internal buffer being too small.
maxBufferSize = 32 * 1024 * 1024 // 32 MB
var buf []byte
contentsReader.Buffer(buf, maxBufferSize)

for contentsReader.Scan() {
	line := contentsReader.Text()
	fmt.Fprint(sinkFd, line+"\n")
}
if err := contentsReader.Err(); err != nil {
	log.ErrorContextf(proxyContext, "Error while reading FD %v: %v", readFd.Fd(), err)
}
```

There is nothing glaringly wrong about this code. We read files that are often
in the range of 20-30 MB. The default buffer was detected to be small previously
by another dev on my team so they left the comment included at the top of the
above fragment.

It seems though, as the files we read have grown in size, we have once again
started seeing an error.

```golang
E0403 16:04:43.728667     591 our_go_file.go:859] Error while reading FD 79: bufio.Scanner: token too long
```

One choice would be to increase the buffer
size further. It is 64KB by default, we'd resized it to 32 MB, and we could
just as well have made it 48 MB or even larger. This likely would have fixed
the immediate problem. but when would the next time we had to increase this
buffer occured?


It seems to me that the issue stems from a few assumptions with a bufio
scanner.

1. At time of authoring, or at least buffer size selection, the line size of
   the file is understood, such that we can size the buffer appropriately.
   
2. Each line is more or less the same size. This makes a single buffer size
   make sense for reading lines into.

For something like, reading in a csv, `bufio.Scanner` works quite well. A line
is unlikely to exceed 64 KB and, even if it was, most lines would be the same
size making it reasonable to increase the buffer to a size that is larger than
each line but not drastically larger than the smallest line.

In our use, most lines will be similarly sized, but it is very possible to
have one *rather large line*.


## Enter bufio.Reader

`bufio` provides support for file reading over a few types today: `Reader`,
`ReadWriter`, `Writer`, and `Scanner`. Let's reauthor the scanner code above
using a `bufio.Reader`.

```golang
reader := bufio.NewReader(readFd)

for {
	line, err := reader.ReadString('\n')
	if err != nil {
		if err == io.EOF {
			break
		}
		log.ErrorContextf(proxyContext, "Error while reading FD %v: %v", readFd.Fd(), err)
		break
	}

	fmt.Fprint(sinkFd, line)
}
```

This code is fairly similar to the above but there are a few differences.

1. We do not need to allocate a buffer of a size.
2. The error handling is inline with the read, and we have to manage EOF.
3. ReadString will include the newline in the return value.


## Summary

Golang offers users multiple ways to read file input, and `bufio.Scanner` seems
a convenient way to read in content; the interface is friendly and creates
readable code. But one needs to be sure they understand the constraints assumed
by relying on this implementation.

Today the golang [documentation]() calls out some of this.

> Scanning stops unrecoverably at EOF, the first I/O error, or a token too
> large to fit in the Scanner.Buffer. When a scan stops, the reader may have
> advanced arbitrarily far past the last token. Programs that need more control
> over error handling or large  tokens, or must run sequential scans on a
> reader, should use bufio.Reader instead.

So, if the file you are reading has well understood line lengths, the default
token delimiter of a `bufio.Scanner`, it may be the right interface to use.
And if your file is less evenly delimited by line-terminations, it may make
sense to pick a different delimiter or use `bufio.Reader` instead.