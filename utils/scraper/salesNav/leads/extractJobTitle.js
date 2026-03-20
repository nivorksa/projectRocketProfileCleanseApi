const extractJobTitle = async (page) => {
  return await page.evaluate(() => {
    const title =
      document
        .querySelector('span[data-anonymize="job-title"]')
        ?.innerText?.trim()
        .toLowerCase() || "";
    return title;
  });
};

export default extractJobTitle;
