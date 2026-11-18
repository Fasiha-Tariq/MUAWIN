import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_OUTLINE = path.resolve(
  __dirname,
  "../../backend/data/course_setup_files/53289/CS7_MUAWIN_Female/MUAWIN_Course_Outline.docx"
);
const SAMPLE_SCHEDULE = path.resolve(
  __dirname,
  "../../backend/data/course_setup_files/53289/CS7_MUAWIN_Female/Class_Schedule.docx"
);

test.describe("MUAWIN Full-Stack System Workflows", () => {
  test("backend OpenAPI schema is reachable and healthy", async ({ request }) => {
    const res = await request.get("http://127.0.0.1:8000/openapi.json");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.paths).toBeDefined();
  });

  test("frontend loads without runtime or network 500 errors", async ({ page }) => {
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("/");
    await expect(page.locator("body")).not.toBeEmpty();
    await page.waitForTimeout(1000);

    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });

  test("navigates UI views and validates file upload controls if visible", async ({ page }) => {
    await page.goto("/");

    const navItems = page.locator("nav a, nav button, aside a, aside button");
    const count = await navItems.count();

    for (let i = 0; i < Math.min(count, 6); i++) {
      const item = navItems.nth(i);
      if (await item.isVisible()) {
        await item.click();
        await page.waitForTimeout(300);
        await expect(page.locator("body")).not.toBeEmpty();

        const fileInputs = page.locator('input[type="file"]');
        const fileInputCount = await fileInputs.count();
        if (fileInputCount >= 1) {
          await fileInputs.nth(0).setInputFiles(SAMPLE_OUTLINE);
        }
        if (fileInputCount >= 2) {
          await fileInputs.nth(1).setInputFiles(SAMPLE_SCHEDULE);
        }
      }
    }
  });
});
