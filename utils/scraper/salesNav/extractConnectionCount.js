const extractConnectionCount = async (page) => {
  // Wait for the "connections" text to appear (up to 5 seconds)
  await page
    .waitForFunction(
      () => {
        const section = document.querySelector("section._header_sqh8tm");
        if (!section) return false;
        return section.textContent.toLowerCase().includes("connections");
      },
      { timeout: 5000 }
    )
    .catch(() => {}); // silently ignore timeout

  return await page.evaluate(() => {
    const headerSection = document.querySelector("section._header_sqh8tm");
    let connections = "";

    if (headerSection) {
      const allDivs = Array.from(headerSection.querySelectorAll("div"));
      const bottomLevelDivs = allDivs.filter((div) => {
        const text = div.textContent?.trim().toLowerCase() || "";
        const includesConnections = text.includes("connections");

        if (!includesConnections) return false;

        const hasChildDivWithConnections = Array.from(
          div.querySelectorAll("div")
        ).some((child) =>
          child.textContent?.trim().toLowerCase().includes("connections")
        );

        return !hasChildDivWithConnections;
      });

      if (bottomLevelDivs.length > 0) {
        connections = bottomLevelDivs[0].textContent.trim().toLowerCase();
      }
    }

    const connMatch = connections.match(/\d[\d,+]*/);
    return connMatch ? parseInt(connMatch[0].replace(/[,+]/g, ""), 10) : 0;
  });
};

export default extractConnectionCount;
