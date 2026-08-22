import { copyFile } from "node:fs/promises";

try {
  await copyFile(new URL("../public/oidc.json", import.meta.url), new URL("../dist/oidc.json", import.meta.url));
  console.log("copied public/oidc.json -> dist/oidc.json");
} catch {
  console.log("public/oidc.json not found, skipping copy");
}
