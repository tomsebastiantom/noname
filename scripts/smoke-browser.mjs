// Visible real-browser verification of the local chain:
//
//   Chrome (host, VISIBLE) -> client 5173 -> edge 8787 (wrangler dev) -> api 3000 (tsx) -> infra (k8s)
//
// Not headless, so the run can be watched. Uses the installed Chrome plus the playwright-core already in the
// pnpm store: no browser download, no new dependency.
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const store = join(process.cwd(), "node_modules", ".pnpm");
const coreDir = readdirSync(store).find((d) => d.startsWith("playwright-core@"));
const { chromium } = await import(
  pathToFileURL(join(store, coreDir, "node_modules", "playwright-core", "index.mjs")).href
);

const BASE = process.env.BASE_URL ?? "http://yogastore.localhost:5173";
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name.padEnd(32)} ${String(detail).slice(0, 110)}`);
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  slowMo: 180,
  args: ["--start-maximized"],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

const serverErrors = [];
page.on("response", (r) => {
  if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120));
});

async function visit(path, shot) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3500);
  if (shot) await page.screenshot({ path: shot });
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200);
  return { status: response?.status() ?? 0, title: await page.title(), text, url: page.url() };
}

const home = await visit("/", "shot-storefront.png");
record("storefront loads", home.status === 200 && home.text.length > 20, `${home.status} "${home.title}"`);
record("storefront renders content", /welcome|explore|sign in|blocks|commerce/i.test(home.text), home.text.slice(0, 90));

const product = await visit("/products/demo-sneakers", "shot-product.png");
record("seeded product page", /99\.99|sneakers/i.test(product.text), product.text.slice(0, 90));

const login = await visit("/login", "shot-login.png");
record("login page renders", /sign in|welcome back|email/i.test(login.text), login.text.slice(0, 90));

try {
  const emailFirst = page.locator('button:has-text("Continue with email"), button:has-text("Email")').first();
  if (await emailFirst.count()) {
    await emailFirst.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
  await emailInput.fill("admin@zitadel.localhost");
  await page.locator('input[type="password"]').first().fill("NonameAdmin1!");
  await page.screenshot({ path: "shot-login-filled.png" });
  await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Continue")').first().click();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: "shot-after-login.png" });
  const afterUrl = page.url();
  const afterText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 140);
  record("login leaves /login", !/\/login/.test(afterUrl), `${afterUrl} | ${afterText.slice(0, 60)}`);

  const admin = await visit("/admin", "shot-admin.png");
  record("admin dashboard", !/sign in to continue|continue with email/i.test(admin.text), `${admin.status} ${admin.text.slice(0, 70)}`);
} catch (error) {
  record("login flow", false, error.message.slice(0, 120));
}

record("no 5xx responses", serverErrors.length === 0, serverErrors[0] ?? "clean");
record("no console errors", consoleErrors.length === 0, consoleErrors[0] ?? "clean");

console.log("\nwindow stays open 20s for inspection...");
await page.waitForTimeout(20_000);
await context.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED: ${failed.map((f) => f.name).join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);
