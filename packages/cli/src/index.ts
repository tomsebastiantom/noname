#!/usr/bin/env node
import { Command } from "commander";
import { execa } from "execa";

const program = new Command();

program
  .name("noname")
  .description(
    "AI-native, declarative full-stack platform. Describe -> AI generates spec -> spec executes UI, backend, integrations.",
  )
  .version("0.0.1");

program
  .command("init")
  .description("Scaffold a new project in the current directory")
  .action(async () => {
    console.log("Run from the repo root: pnpm install && cp .env.example .env");
  });

program
  .command("dev")
  .description("Start the development server (Postgres + Dragonfly via Docker)")
  .action(async () => {
    await execa("docker", ["compose", "up", "-d"], { stdio: "inherit" });
    await execa("pnpm", ["--filter", "@noname/server", "dev"], { stdio: "inherit" });
  });

program
  .command("status")
  .description("Check API health and Docker services")
  .action(async () => {
    const port = process.env.PORT || "3000";
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      const body = await res.json();
      console.log(`API (${port}):`, res.ok ? "ok" : "error", body);
    } catch {
      console.log(`API (${port}): unreachable`);
    }
    try {
      await execa("docker", ["compose", "ps"], { stdio: "inherit" });
    } catch {
      console.log("Docker compose: not running or unavailable");
    }
  });

program.parse(process.argv);
