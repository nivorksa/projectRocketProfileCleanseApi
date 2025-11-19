import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";

export const verifyToken = (req, res, next) => {
  const token = req.cookies.accessToken;

  if (!token) {
    return next(createError(401, "You are not authenticated!"));
  }

  jwt.verify(token, process.env.JWT_KEY, (err, payload) => {
    if (err) {
      console.error("JWT Verification Error:", err);
      return next(createError(403, "Token is not valid"));
    }

    // Ensure payload contains the correct fields
    if (!payload || !payload.id) {
      return next(createError(403, "Token payload is missing required fields"));
    }

    req.userId = payload.id;

    next();
  });
};
