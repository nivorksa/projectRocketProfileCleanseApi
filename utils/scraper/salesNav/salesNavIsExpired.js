const salesNavIsExpired = async (page) => {
  const url = page.url();
  if (url.includes("/premium") || url.includes("/checkout")) {
    return true;
  }

  return await page.evaluate(() => {
    return [...document.querySelectorAll("button.premium-chooser__cta")].some(
      (btn) =>
        btn.textContent && btn.textContent.toLowerCase().includes("reactivate")
    );
  });
};

export default salesNavIsExpired;
