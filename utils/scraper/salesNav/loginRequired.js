const loginRequired = async (page) => {
  const url = page.url();

  // Fast URL-based detection (LinkedIn often redirects)
  if (url.includes("/login") || url.includes("/checkpoint")) {
    return true;
  }

  return await page.evaluate(() => {
    return [...document.querySelectorAll("button")].some((btn) => {
      const text = btn.textContent?.trim().toLowerCase();
      const aria = btn.getAttribute("aria-label")?.toLowerCase();
      const control = btn.getAttribute("data-litms-control-urn");

      return (
        btn.type === "submit" &&
        (text === "sign in" || aria === "sign in") &&
        control === "login-submit"
      );
    });
  });
};

export default loginRequired;
