#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("noname")
  .description("AI-native, declarative full-stack platform. Describe -> AI generates spec -> spec executes UI, backend, integrations.")
  .version("0.0.1");

program
  .command("init")
  .description("Scaffold a new project in the current directory")
  .action(async () => {
    console.log("Scaffolding new project...");
    // Phase 1: create project structure, config files, Docker Compose
  });

program
  .command("dev")
  .description("Start the development server with hot reload")
  .option("--db sqlite", "Use SQLite instead of Postgres (lightweight dev mode)")
  .action(async (options) => {
    console.log("Starting dev server...");
    if (options.db === "sqlite") {
      console.log("SQLite mode: ClickHouse skipped, events to console");
    }
    // Phase 0: exec docker compose up or start server directly
  });

program
  .command("status")
  .description("Check service health (Postgres, Dragonfly, ClickHouse, Logto)")
  .action(async () => {
    console.log("Checking services...");
    // Phase 0: HTTP health check to running server
  });

program.parse(process.argv);
