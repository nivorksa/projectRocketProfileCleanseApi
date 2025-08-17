const extractCompany = async (page) => {
  return await page.evaluate(() => {
    // Select the first company name span inside experience section
    const companySpan = document.querySelector(
      'section[data-view-name="profile-card"] ul li.artdeco-list__item a[data-field="experience_company_logo"] span.t-14.t-normal > span[aria-hidden="true"]'
    );
    if (!companySpan) return "";

    // Get text like "3B´s Research Group · Full-time"
    const fullText = companySpan.innerText.trim();

    // Extract only company name before ' · '
    const companyName = fullText.split(" · ")[0].toLowerCase();

    return companyName;
  });
};

export default extractCompany;
