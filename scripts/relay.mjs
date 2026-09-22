#!/usr/bin/env bun
// OpenRelay development-channel CLI (reconstructed after repo loss; see docs/recovery notes)
import { launch } from "./relay-launcher.mjs"
const channel = process.argv[2] === "daily" ? "daily" : "dev"
await launch(channel, process.argv.slice(channel === "daily" ? 3 : 2))
