import User from "../models/user.model.js";
import SellerProfile from "../models/sellerProfile.model.js";
import BuyerProfile from "../models/buyerProfile.model.js";
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

    const savedUser = await newUser.save();

    //Create sellerProfile
    const newSellerProfile = new SellerProfile({
      userId: savedUser._id,
      ...req.body,
    });

    const savedSellerProfile = await newSellerProfile.save();

    savedUser.sellerProfileId = savedSellerProfile._id;
    await savedUser.save();

    res.status(201).send("User and SellerProfile has been created");

    //Create buyerProfile
    const newBuyerProfile = new BuyerProfile({
      userId: savedUser._id,
      ...req.body,
    });

    const savedBuyerProfile = await newBuyerProfile.save();

    savedUser.buyerProfileId = savedBuyerProfile._id;
    await savedUser.save();

    res.status(201).send("User and BuyerProfile has been created");
  } catch (err) {
    console.error(err); // Log the error for debugging purposes
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.body.username });

    if (!user) return next(createError(404, "User not found!"));

    const isCorrect = bcrypt.compareSync(req.body.password, user.password);
    if (!isCorrect)
      return next(createError(400, "Wrong password or username!"));

    // Assuming you want to set the role to 'buyer' regardless of its current value
    user.role = "buyer";
    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role, // Always set the role to 'buyer' in the JWT payload
      },
      process.env.JWT_KEY
    );

    const { password, ...info } = user._doc;

    // Determine if the app is in production mode
    const isProduction = process.env.NODE_ENV === "production";

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // Enable secure cookies only in production
      sameSite: isProduction ? "None" : "Lax", // Use 'lax' for localhost
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    // Set the cookie
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
        secure: isProduction, // Use secure only in production
        sameSite: isProduction ? "None" : "Lax", // Use 'None' in production, 'Lax' for localhost
      })
      .status(200)
      .send("User has been logged out!");
  } catch (err) {
    res.status(500).send("Logout failed. Please try again!");
  }
};
