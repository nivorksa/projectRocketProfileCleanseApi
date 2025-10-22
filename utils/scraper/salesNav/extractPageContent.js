const extractPageContent = async (page) => {
  try {
    const content = await page.evaluate(() => {
      // Collect all visible text on the page
      return document.body.innerText || "";
    });
    return content;
  } catch (err) {
    console.error("Error extracting page content:", err);
    return "";
  }
};

export default extractPageContent;
