#!/usr/bin/env node
import { runCodexHookFromStdin } from "./hooks.js";
import { doctorCodexHooks, installCodexHooks, uninstallCodexHooks } from "./hook-config.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "hook") {
    const code = await runCodexHookFromStdin(process.stdin, { configuredPetId: readPetArg(args), debug: process.env.OPENPETS_DEBUG === "1" });
    process.exitCode = code;
    return;
  }
  if (command === "doctor-hooks") {
    process.stderr.write(`${JSON.stringify(doctorCodexHooks(readPathArg(args)), null, 2)}\n`);
    return;
  }
  if (command === "install-hooks") {
    process.stderr.write(`${JSON.stringify(installCodexHooks(readPathArg(args)), null, 2)}\n`);
    return;
  }
  if (command === "uninstall-hooks") {
    process.stderr.write(`${JSON.stringify(uninstallCodexHooks(readPathArg(args)), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: open-pets-codex <hook|doctor-hooks|install-hooks|uninstall-hooks> [--config <path>] [--pet <id>]\n");
  process.exitCode = 1;
}

function readPathArg(args: readonly string[]): string | undefined {
  const index = args.indexOf("--config");
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && value.length > 0 ? value : undefined;
}

function readPetArg(args: readonly string[]): string | undefined {
  const equals = args.find((arg) => arg.startsWith("--pet="));
  if (equals) return equals.slice("--pet=".length);
  const index = args.indexOf("--pet");
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error("Missing value for --pet.");
  return value && value.length > 0 ? value : undefined;
}

main().catch((error: unknown) => {
  process.stderr.write(`OpenPets Codex CLI failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
