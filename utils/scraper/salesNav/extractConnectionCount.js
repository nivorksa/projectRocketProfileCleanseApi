const extractConnectionCount = async (page) => {
  await page
    .waitForFunction(
      () => {
        const section = document.querySelector("section._header_sqh8tm");
        return (
          section && section.textContent.toLowerCase().includes("connections")
        );
      },
      { timeout: 5000 },
    )
    .catch(() => {});

  return await page.evaluate(() => {
    const headerSection = document.querySelector("section._header_sqh8tm");
    if (!headerSection) return "N/A";

    const sectionText = headerSection.textContent.toLowerCase();
    if (!sectionText.includes("connections")) {
      return "N/A";
    }

    const allDivs = Array.from(headerSection.querySelectorAll("div"));

    const bottomLevelDivs = allDivs.filter((div) => {
      const text = div.textContent?.trim().toLowerCase() || "";
      if (!text.includes("connections")) return false;

      const hasChildWithConnections = Array.from(
        div.querySelectorAll("div"),
      ).some((child) =>
        child.textContent?.toLowerCase().includes("connections"),
      );

      return !hasChildWithConnections;
    });

    if (bottomLevelDivs.length === 0) return "N/A";

    const text = bottomLevelDivs[0].textContent;
    const match = text.match(/\d[\d,+]*/);

    // IMPORTANT PART
    // If "connections" exists but number is 0, return 0 (valid)
    if (match) {
      return parseInt(match[0].replace(/[,+]/g, ""), 10);
    }

    return "N/A";
  });
};

export default extractConnectionCount;
