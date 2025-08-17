const extractFullName = async (page) => {
  return await page.evaluate(() => {
    const name =
      document
        .querySelector('h1[data-anonymize="person-name"]')
        ?.innerText?.trim()
        .toLowerCase() || "";
    return name;
  });
};

export default extractFullName;
