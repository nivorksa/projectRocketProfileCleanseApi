import mongoose from "mongoose";
const { Schema } = mongoose;

const tokenSchema = new Schema(
  {
    accountName: {
      type: String,
      required: true,
    },

    token: {
      type: String,
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Same user can't reuse accountName
tokenSchema.index({ userId: 1, accountName: 1 }, { unique: true });

// Same user can't reuse token
tokenSchema.index({ userId: 1, token: 1 }, { unique: true });

export default mongoose.model("Token", tokenSchema);
