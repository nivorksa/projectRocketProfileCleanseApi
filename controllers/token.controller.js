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

    // Check account name per user
    const accountExists = await Token.findOne({
      userId: req.userId,
      accountName,
    });

    if (accountExists) {
      return next(createError(400, "Account name already exists"));
    }

    // Check token per user
    const tokenExists = await Token.findOne({
      userId: req.userId,
      token,
    });

    if (tokenExists) {
      return next(createError(400, "Token already exists"));
    }

    const newToken = new Token({
      accountName,
      token,
      userId: req.userId,
    });

    const saved = await newToken.save();
    res.status(201).json(saved);
  } catch (err) {
    // Handle duplicate key error from MongoDB
    if (err.code === 11000) {
      return next(
        createError(400, "Account name or token already exists for this user"),
      );
    }
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
