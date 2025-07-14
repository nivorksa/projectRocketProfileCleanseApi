const extractConnectionCount = async (page) => {
  return await page.evaluate(() => {
    const headerSection = document.querySelector("section._header_sqh8tm");
    let connections = "";

    if (headerSection) {
      const allDivs = Array.from(headerSection.querySelectorAll("div"));
      const bottomLevelDivs = allDivs.filter((div) => {
        const text = div.innerText?.trim().toLowerCase() || "";
        const includesConnections = text.includes("connections");

        if (!includesConnections) return false;

        const hasChildDivWithConnections = Array.from(
          div.querySelectorAll("div")
        ).some((child) =>
          child.innerText?.trim().toLowerCase().includes("connections")
        );

        return !hasChildDivWithConnections;
      });

      if (bottomLevelDivs.length > 0) {
        connections = bottomLevelDivs[0].innerText.trim().toLowerCase();
      }
    }

    const connMatch = connections.match(/\d[\d,+]*/);
    return connMatch ? parseInt(connMatch[0].replace(/[,+]/g, ""), 10) : 0;
  });
};

export default extractConnectionCount;
