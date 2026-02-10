const extractSalesNavUrn = async (page) => {
  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const urnRegex = /urn:li:fsd_profile:([A-Za-z0-9_-]+)/;

    for (let link of links) {
      const href = link.getAttribute("href");
      if (!href) continue;

      // Check URN in path
      const matchPath = href.match(urnRegex);
      if (matchPath && matchPath[1]) return matchPath[1];

      // Check URN in query parameter profileUrn
      try {
        const url = new URL(href, window.location.origin);
        const profileUrnParam = url.searchParams.get("profileUrn");
        if (profileUrnParam) {
          const decoded = decodeURIComponent(profileUrnParam);
          const matchParam = decoded.match(urnRegex);
          if (matchParam && matchParam[1]) return matchParam[1];
        }
      } catch (err) {
        // Ignore invalid URLs
      }
    }

    // Return "N/A" if not found
    return "N/A";
  });
};

export default extractSalesNavUrn;
