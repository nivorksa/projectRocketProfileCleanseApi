import mongoose from "mongoose";
const { Schema } = mongoose;

const scrapeJobSchema = new Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    status: {
      type: String,
      enum: ["running", "done", "stopped", "error"],
      default: "running",
    },

    sheetName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    cleanseFilePath: {
      type: String,
      required: true,
    },

    error: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ScrapeJob", scrapeJobSchema);
