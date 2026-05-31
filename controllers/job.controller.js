import ScrapeJob from "../models/job.model.js";
import { runningJobs } from "../utils/jobRuntime.js";

/* ------------------ JOB LIST ------------------ */

export const listJobs = async (req, res) => {
  const { jobType, status } = req.query;

  const query = {
    userId: req.userId,
  };

  if (jobType) {
    query.jobType = jobType;
  }

  if (status) {
    query.status = { $in: status.split(",") };
  }

  const jobs = await ScrapeJob.find(query).sort({ createdAt: -1 });

  res.json(jobs);
};

/* ------------------ STOP ------------------ */

export const stopJob = async (req, res) => {
  const { jobId } = req.body;

  await ScrapeJob.updateOne(
    { jobId },
    {
      $push: {
        logs: {
          status: "Stop Requested",
          message: "Scraping stop requested by user",
        },
      },
      stopRequested: true,
    },
  );

  const runtime = runningJobs.get(jobId);
  if (runtime) {
    runtime.stopFlag.stopped = true;
  }

  res.sendStatus(200);
};
