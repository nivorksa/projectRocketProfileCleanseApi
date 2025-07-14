const extractCompany = async (page) => {
  return await page.evaluate(() => {
    const company =
      document
        .querySelector(
          '[data-sn-view-name="lead-current-role"] a[data-anonymize="company-name"]'
        )
        ?.innerText?.trim()
        .toLowerCase() || "";
    return company;
  });
};

export default extractCompany;
