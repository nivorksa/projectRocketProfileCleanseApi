const extractJobTitle = async (page) => {
  return await page.evaluate(() => {
    // Find the first job title span inside the experience section
    const titleSpan = document.querySelector(
      'div.hoverable-link-text.t-bold > span[aria-hidden="true"]'
    );
    if (!titleSpan) return "";

    return titleSpan.innerText.trim().toLowerCase();
  });
};

export default extractJobTitle;
