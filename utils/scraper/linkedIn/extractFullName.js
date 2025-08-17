const extractFullName = async (page) => {
  // Wait for the LinkedIn full name element to appear
  await page.waitForSelector("h1", { timeout: 15000 });

  return await page.evaluate(() => {
    const el = document.querySelector("h1.text-heading-xlarge");
    return el?.innerText.trim().toLowerCase() || "";
  });
};

export default extractFullName;
