const extractCompany = async (page) => {
  // Wait for the company name element in the experience section
  await page.waitForSelector(
    'section[data-view-name="profile-card"] ul li.artdeco-list__item a[data-field="experience_company_logo"] span.t-14.t-normal > span[aria-hidden="true"]',
    { timeout: 15000 }
  );

  return await page.evaluate(() => {
    const companySpan = document.querySelector(
      'section[data-view-name="profile-card"] ul li.artdeco-list__item a[data-field="experience_company_logo"] span.t-14.t-normal > span[aria-hidden="true"]'
    );
    if (!companySpan) return "";

    const fullText = companySpan.innerText.trim();
    const companyName = fullText.split(" · ")[0].toLowerCase();

    return companyName;
  });
};

export default extractCompany;
