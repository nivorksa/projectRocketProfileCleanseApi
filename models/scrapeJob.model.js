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
      index: true,
    },

    status: {
      type: String,
      enum: ["running", "done", "stopped", "error"],
      default: "running",
      index: true,
    },

    sheetName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    originalFileName: {
      type: String,
      required: true,
    },

    cleanseFilePath: {
      type: String,
      required: true,
    },

    lastRow: {
      type: Number,
      default: 1,
    },

    startedAt: {
      type: Date,
    },

    endedAt: {
      type: Date,
    },

    durationMs: {
      type: Number,
      default: 0,
    },

    avgRowTimeMs: {
      type: Number,
      default: 0,
    },

    totalRows: {
      type: Number,
    },

    // Logs for SSE
    logs: [
      {
        row: Number,
        status: String,
        message: String,
        matches: Schema.Types.Mixed,
        note: String,
        excel: Schema.Types.Mixed,
        salesnav: Schema.Types.Mixed,
        error: String,
        errorStatus: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    config: {
      fullNameColumn: String,
      companyColumn: String,
      jobTitleColumn: String,
      urlColumn: String,
      minimumConnections: Number,
      keywordSearchEnabled: Boolean,
      keywords: [String],
      goLoginToken: String,
      goLoginProfileId: String,
    },

    error: String,
  },
  { timestamps: true }
);

export default mongoose.model("ScrapeJob", scrapeJobSchema);
