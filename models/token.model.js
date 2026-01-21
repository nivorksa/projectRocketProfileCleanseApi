import mongoose from "mongoose";
const { Schema } = mongoose;

const tokenSchema = new Schema(
  {
    accountName: {
      type: String,
      required: true,
      unique: true,
    },

    token: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Token", tokenSchema);
