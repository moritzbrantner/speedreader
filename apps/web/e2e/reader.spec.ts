import { expect, test } from "@playwright/test";

const extractionPath = "/__mock-pdf-extraction";

test("reads pasted plain text without contacting the extraction service", async ({ page }) => {
  let extractionRequests = 0;
  await page.route(extractionPath, async (route) => {
    extractionRequests += 1;
    await route.abort();
  });

  await page.goto("/");

  const sourceText = page.getByLabel("Source text");
  const reader = page.getByRole("region", { name: "Reader" });
  const currentChunk = reader.getByRole("status");

  await sourceText.fill("Alpha beta gamma delta");
  await expect(currentChunk).toHaveText("Alpha");
  await expect(reader.getByText("0 / 4", { exact: true })).toBeVisible();

  await reader.getByRole("slider").fill("60");
  await page.getByRole("heading", { name: "Speedreader" }).click();
  await page.keyboard.press("Space");
  await expect(reader.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(reader.getByRole("button", { name: "Play" })).toBeVisible();

  await reader.getByRole("button", { name: "Next" }).click();
  await expect(currentChunk).toHaveText("beta");
  await page.keyboard.press("ArrowRight");
  await expect(currentChunk).toHaveText("gamma");

  await reader.getByRole("button", { name: "Next" }).click();
  await reader.getByRole("button", { name: "Next" }).click();
  await expect(currentChunk).toHaveText("Finished");
  await expect(reader.getByText("4 / 4", { exact: true })).toBeVisible();
  expect(extractionRequests).toBe(0);
});

test("feeds a mocked PDF reading document into the reader", async ({ page }) => {
  const extractedText = "Extracted words enter reader";
  await page.route(extractionPath, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        version: 1,
        text: extractedText,
        pages: [
          {
            pageNumber: 1,
            text: extractedText,
            provenance: { source: "fixture" },
          },
        ],
        diagnostics: [],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/");

  const extractionRequestPromise = page.waitForRequest(`**${extractionPath}`);
  await page.getByLabel("Import PDF").setInputFiles({
    buffer: Buffer.from("%PDF-1.7 fixture"),
    mimeType: "application/pdf",
    name: "fixture.pdf",
  });

  const extractionRequest = await extractionRequestPromise;
  expect(extractionRequest.method()).toBe("POST");
  expect(await extractionRequest.headerValue("content-type")).toBe("application/pdf");
  expect(extractionRequest.postDataBuffer()).toEqual(Buffer.from("%PDF-1.7 fixture"));

  await expect(page.getByRole("status").filter({ hasText: "Imported 1 pages." })).toBeVisible();
  await expect(page.getByLabel("Source text")).toHaveValue(extractedText);

  const reader = page.getByRole("region", { name: "Reader" });
  await expect(reader.getByRole("status")).toHaveText("Extracted");
  await expect(reader.getByText("0 / 4", { exact: true })).toBeVisible();
});
