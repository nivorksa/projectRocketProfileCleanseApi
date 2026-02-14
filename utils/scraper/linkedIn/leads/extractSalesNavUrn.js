const extractSalesNavUrn = async (page) => {
  return await page.evaluate(() => {
    const urnRegex = /urn:li:fsd_profile:([A-Za-z0-9_-]+)/;

    // Only grab links that contain "urn:" or "profileUrn"
    const links = document.querySelectorAll(
      'a[href*="urn:"], a[href*="profileUrn"]',
    );

    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href");
      if (!href) continue;

      // Direct match first (fast path)
      const direct = href.match(urnRegex);
      if (direct) return direct[1];

      // Query param check (without URL constructor)
      const idx = href.indexOf("profileUrn=");
      if (idx !== -1) {
        const value = decodeURIComponent(href.slice(idx + 11));
        const match = value.match(urnRegex);
        if (match) return match[1];
      }
    }

    return "N/A";
  });
};

// const extractSalesNavUrn = async (page) => {
//   return await page.evaluate(() => {
//     const links = Array.from(document.querySelectorAll("a"));
//     const urnRegex = /urn:li:fsd_profile:([A-Za-z0-9_-]+)/;

//     for (let link of links) {
//       const href = link.getAttribute("href");
//       if (!href) continue;

//       // Check URN in path
//       const matchPath = href.match(urnRegex);
//       if (matchPath && matchPath[1]) return matchPath[1];

//       // Check URN in query parameter profileUrn
//       try {
//         const url = new URL(href, window.location.origin);
//         const profileUrnParam = url.searchParams.get("profileUrn");
//         if (profileUrnParam) {
//           const decoded = decodeURIComponent(profileUrnParam);
//           const matchParam = decoded.match(urnRegex);
//           if (matchParam && matchParam[1]) return matchParam[1];
//         }
//       } catch (err) {
//         // Ignore invalid URLs
//       }
//     }

//     // Return "N/A" if not found
//     return "N/A";
//   });
// };

export default extractSalesNavUrn;
