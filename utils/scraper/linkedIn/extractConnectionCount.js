const extractConnectionCount = async (page) => {
  return await page.evaluate(() => {
    // Select the <ul> containing the connections info (using a stable class if possible)
    // Here we just target the <ul> which contains a <li> with "connections" text
    const ulElements = Array.from(document.querySelectorAll("ul"));

    let connectionText = "";

    for (const ul of ulElements) {
      const liWithConnections = Array.from(ul.querySelectorAll("li")).find(
        (li) => li.innerText.toLowerCase().includes("connections")
      );
      if (liWithConnections) {
        connectionText = liWithConnections.innerText.trim().toLowerCase();
        break;
      }
    }

    // Extract the number from connectionText (e.g. "500+ connections")
    const match = connectionText.match(/(\d[\d,+]*)/);
    if (!match) return 0;

    // Clean number string and parse to int (ignoring '+' or commas)
    return parseInt(match[1].replace(/[,+]/g, ""), 10) || 0;
  });
};

export default extractConnectionCount;
