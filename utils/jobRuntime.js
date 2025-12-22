export const runningJobs = new Map();

/*
Structure:

runningJobs.get(jobId) = {
  stopFlag: { stopped: false },
  logs: []
}
*/
