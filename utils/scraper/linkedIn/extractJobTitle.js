const extractJobTitle = async (page) => {
  // Wait for the job title element in the experience section
  await page.waitForSelector(
    'div.hoverable-link-text.t-bold > span[aria-hidden="true"]',
    { timeout: 15000 }
  );

  return await page.evaluate(() => {
    const titleSpan = document.querySelector(
      'div.hoverable-link-text.t-bold > span[aria-hidden="true"]'
    );
    if (!titleSpan) return "";

    return titleSpan.innerText.trim().toLowerCase();
  });
};

export default extractJobTitle;
