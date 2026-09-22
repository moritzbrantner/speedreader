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

test("centers the reader focus and keeps settings underneath it", async ({ page }) => {
  await page.goto("/");

  const reader = page.getByRole("region", { name: "Reader" });
  const focus = reader.getByTestId("reader-focus");
  const settings = reader.getByRole("group", { name: "Reading settings" });
  const viewport = page.viewportSize();
  const focusBox = await focus.boundingBox();
  const settingsBox = await settings.boundingBox();

  expect(viewport).not.toBeNull();
  expect(focusBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  if (viewport === null || focusBox === null || settingsBox === null) return;

  const focusCenter = focusBox.x + focusBox.width / 2;
  expect(Math.abs(focusCenter - viewport.width / 2)).toBeLessThan(24);
  expect(settingsBox.y).toBeGreaterThanOrEqual(focusBox.y + focusBox.height);
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

test("restores plain-text preferences and progress after a browser restart", async ({ page }) => {
  await page.goto("/");

  const sourceText = page.getByLabel("Source text");
  const reader = page.getByRole("region", { name: "Reader" });
  await sourceText.fill("Durable browser progress works");
  await reader.getByRole("slider").fill("420");
  await reader.getByRole("button", { name: "Next" }).click();
  await reader.getByRole("button", { name: "Next" }).click();
  await expect(reader.getByRole("status")).toHaveText("progress");

  await page.reload();

  await expect(sourceText).toHaveValue("Durable browser progress works");
  await expect(reader.getByRole("status")).toHaveText("progress");
  await expect(reader.getByRole("slider")).toHaveValue("420");
  await expect(reader.getByText("2 / 4", { exact: true })).toBeVisible();
});


test("extracts the readable article from a pasted webpage URL", async ({ page }) => {
  const articleUrl = "https://news.example/article";
  await page.route(articleUrl, async (route) => {
    await route.fulfill({
      body: [
        "<!doctype html><html><head><title>Readable article</title></head><body>",
        "<header>Site chrome</header><nav>Navigation noise</nav>",
        "<main><article><h1>Readable article</h1>",
        "<p>The first relevant paragraph explains the subject.</p>",
        "<aside>Related-story noise</aside>",
        "<p>The second relevant paragraph finishes it.</p>",
        "</article></main><footer>Footer noise</footer></body></html>",
      ].join(""),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "text/html; charset=utf-8",
      },
      status: 200,
    });
  });

  await page.goto("/");
  await page.getByLabel("Web address").fill(articleUrl);
  await page.getByRole("button", { name: "Extract webpage" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "Imported Readable article from news.example",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Source text")).toHaveValue(
    "Readable article\nThe first relevant paragraph explains the subject.\nThe second relevant paragraph finishes it.",
  );

  const reader = page.getByRole("region", { name: "Reader" });
  await expect(reader.getByRole("status")).toHaveText("Readable");
});
