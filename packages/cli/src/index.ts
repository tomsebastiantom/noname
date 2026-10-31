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

/**
 * Container engine detection — the platform is **engine-agnostic**.
 *
 * Nothing in the application depends on a container engine: services reach Postgres/Redis/etc. over
 * normal network URLs. An engine is only needed to *start the local infrastructure* and to *build
 * images*, and either podman or docker is acceptable.
 *
 * The CLI previously called `docker compose` unconditionally, which fails on a podman-only machine.
 * Now it detects what is installed: podman first (the development default), docker as the fallback.
 * Neither is required by the runtime.
 */
async function composeEngine(): Promise<"podman" | "docker"> {
  for (const candidate of ["podman", "docker"] as const) {
    try {
      await execa(candidate, ["--version"]);
      return candidate;
    } catch {
      // try the next engine
    }
  }
  throw new Error("No container engine found — install podman (preferred) or docker");
}

program
  .command("dev")
  .description("Start the development server (Postgres + Dragonfly via podman or docker compose)")
  .action(async () => {
    const engine = await composeEngine();
    await execa(engine, ["compose", "up", "-d"], { stdio: "inherit" });
    await execa("pnpm", ["--filter", "@noname/server", "dev"], { stdio: "inherit" });
  });

program
  .command("status")
  .description("Check API health and container services")
  .action(async () => {
    const port = process.env.PORT || "3000";
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      const body = await res.json();
      console.log(`API (${port}):`, res.ok ? "ok" : "error", body);
    } catch {
      console.log(`API (${port}): unreachable`);
    }
    const engine = await composeEngine();
    try {
      await execa(engine, ["compose", "ps"], { stdio: "inherit" });
    } catch {
      console.log(`${engine} compose: not running or unavailable`);
    }
  });

program
  .command("eval")
  .description("Verify a tenant's storefront: machine definitions and every published route")
  .option("--tenant <slug>", "tenant slug", process.env.DEMO_STORE_SLUG ?? "yogastore")
  .option("--api-base <url>", "API base URL", process.env.API_BASE ?? "http://localhost:3000")
  .option("--machines-dir <dir>", "directory holding machine definition JSON files")
  .option("--max-routes <n>", "cap the number of routes checked", "20")
  .option("--json", "machine-readable output")
  .action(async () => {
    // Checks live in @noname/eval; this command only parses arguments and prints.
    const { evalCommand } = await import("./commands/eval");
    process.exitCode = await evalCommand(process.argv.slice(2));
  });

program.parse(process.argv);
