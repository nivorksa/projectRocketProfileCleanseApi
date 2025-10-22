const expandSeeMore = async (page) => {
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      for (const btn of buttons) {
        const text = btn.innerText?.trim().toLowerCase();
        if (
          text === "see more" ||
          text.startsWith("see more about") ||
          text.startsWith("see more experience") ||
          text.startsWith("see more education") ||
          text.startsWith("show more") ||
          text === "more"
        ) {
          btn.click();
        }
      }
    });
    await page.waitForTimeout(2000); // Allow content to load after expanding
  } catch (err) {
    console.error("Error expanding 'see more' sections:", err);
  }
};

export default expandSeeMore;
