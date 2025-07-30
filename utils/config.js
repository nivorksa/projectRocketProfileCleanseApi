// Define API Base URL for axios requests (local or live)
const apiBaseUrl =
  process.env.NODE_ENV === "production"
    ? "https://projectrocketprofilecleanseapi.onrender.com/api/"
    : "http://localhost:8800/api/";

// Define Socket URL for socket.io connections (local or live)
// const socketUrl =
//   process.env.NODE_ENV === "production"
//     ? "https://projectrocketprofilecleanseapi.onrender.com"
//     : "http://localhost:8800";

// Define allowed origins for CORS (frontend URLs)
const allowedOrigins = [
  "http://localhost:3000", // Local frontend for development
  "https://projectrocketprofilecleansedev.netlify.app", // Deployed frontend on Netlify
];

export {
  apiBaseUrl,
  // socketUrl,
  allowedOrigins,
};
