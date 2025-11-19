import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";

export const register = async (req, res, next) => {
  try {
    const hash = bcrypt.hashSync(req.body.password, 5);

    const newUser = new User({
      ...req.body,
      password: hash,
    });

    await newUser.save();

    res.status(201).send("User has been created");
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) return next(createError(404, "User not found!"));

    const isCorrect = bcrypt.compareSync(req.body.password, user.password);
    if (!isCorrect)
      return next(createError(400, "Wrong password or username!"));

    const token = jwt.sign({ id: user._id }, process.env.JWT_KEY);

    const { password, ...info } = user._doc;

    const isProduction = process.env.NODE_ENV === "production";

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "None" : "Lax",
<<<<<<< HEAD
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), //30 days
      path: "/",
=======
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
>>>>>>> 9780213b09e183be1473a95d943f22d6005529c7
    };

    res.cookie("accessToken", token, cookieOptions).status(200).send(info);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    res
      .clearCookie("accessToken", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "None" : "Lax",
<<<<<<< HEAD
        path: "/", // IMPORTANT
        expires: new Date(0), // IMPORTANT for Edge
=======
>>>>>>> 9780213b09e183be1473a95d943f22d6005529c7
      })
      .status(200)
      .send("User has been logged out!");
  } catch {
    res.status(500).send("Logout failed. Please try again!");
  }
};
