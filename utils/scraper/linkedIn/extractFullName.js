const extractFullName = async (page) => {
  return await page.evaluate(() => {
    const el = document.querySelector("h1");
    return el?.innerText.trim().toLowerCase() || "";
  });
};

export default extractFullName;
