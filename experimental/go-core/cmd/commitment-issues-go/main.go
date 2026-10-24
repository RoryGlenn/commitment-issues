// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"slices"
	"syscall"
	"time"

	"github.com/RoryGlenn/commitment-issues/experimental/go-core/internal/core"
)

const version = "0.0.0-experimental"
const help = `Experimental read-only staged checker (not the v3 command).
Usage: commitment-issues-go precommit [--json] [--directory path] [--timeout 30s]
       commitment-issues-go --help | --version
Checks staged Git/blob state and possible text conflict markers. Advisory only.
No project config, Ruff, lint, tests, hooks, fixes or downloads are executed.
Exit 0 means allowed, not complete ecosystem validation. JSON uses schema v1.
`

func execute(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		_, err := io.WriteString(stdout, help)
		if err != nil {
			return 2
		}
		return 0
	}
	if len(args) == 1 && args[0] == "--version" {
		_, err := fmt.Fprintln(stdout, version)
		if err != nil {
			return 2
		}
		return 0
	}
	jsonOutput := slices.Contains(args, "--json")
	result := core.Unavailable("usage", "Invalid arguments; use --help for the experimental command contract.", 2)
	if len(args) > 0 && args[0] == "precommit" {
		flags := flag.NewFlagSet("precommit", flag.ContinueOnError)
		flags.SetOutput(io.Discard)
		jsonFlag := flags.Bool("json", false, "emit one JSON v1 document")
		directory := flags.String("directory", ".", "repository or subdirectory")
		timeout := flags.Duration("timeout", 30*time.Second, "shared deadline (1ms through 30s)")
		err := flags.Parse(args[1:])
		if err == flag.ErrHelp {
			_, writeErr := io.WriteString(stdout, help)
			if writeErr != nil {
				return 2
			}
			return 0
		}
		if err == nil && flags.NArg() == 0 && *timeout >= time.Millisecond && *timeout <= 30*time.Second {
			jsonOutput = *jsonFlag
			bounded, cancel := context.WithTimeout(ctx, *timeout)
			defer cancel()
			result = core.Run(bounded, *directory)
		}
	}
	var output []byte
	if jsonOutput {
		var err error
		output, err = json.Marshal(result)
		if err != nil {
			fmt.Fprintln(stderr, "Unable to encode result.")
			return 2
		}
		output = append(output, '\n')
	} else {
		output = []byte(core.Human(result))
	}
	if len(output) > 4*1024*1024 {
		result = core.Unavailable("output-limit", "Result exceeded the prototype output limit; complete evidence is unavailable.", 0)
		if jsonOutput {
			output, _ = json.Marshal(result)
			output = append(output, '\n')
		} else {
			output = []byte(core.Human(result))
		}
	}
	if _, err := stdout.Write(output); err != nil {
		fmt.Fprintln(stderr, "Unable to write result.")
		return 2
	}
	return result.ExitCode
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(execute(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
