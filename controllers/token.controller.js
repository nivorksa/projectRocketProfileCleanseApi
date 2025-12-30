import Token from "../models/token.model.js";
import User from "../models/user.model.js";
import createError from "../utils/createError.js";

export const addToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const { accountName, token } = req.body;

    // Check if account name is already used
    const exists = await Token.findOne({ accountName });
    if (exists) {
      return next(createError(400, "Account name already exists"));
    }

    // Save the token
    const newToken = new Token({
      accountName,
      token,
      userId: req.userId,
    });

    const saved = await newToken.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

export const getUserTokens = async (req, res, next) => {
  try {
    const tokens = await Token.find({ userId: req.userId }).sort({
      createdAt: -1,
    });

    if (!tokens || tokens.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
};
