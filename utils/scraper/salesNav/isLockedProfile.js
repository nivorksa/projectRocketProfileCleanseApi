const isLockedProfile = async (page) => {
  return await page.evaluate(() => {
    const nameHeader = document.querySelector(
      'h1[data-anonymize="person-name"]'
    );
    const unlockBtn = [...document.querySelectorAll("button")].find(
      (btn) => btn.innerText.trim().toLowerCase() === "unlock full profile"
    );
    return nameHeader?.innerText.trim() === "LinkedIn Member" || !!unlockBtn;
  });
};

export default isLockedProfile;
