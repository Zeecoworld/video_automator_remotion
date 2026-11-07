// Scheduled functions have a short time limit, so this just kicks off the background function.
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_URL;
  await fetch(`${base}/.netlify/functions/refresh-background`, { method: "POST" });
};
export const config = { schedule: "0 6 * * 1,4" }; // Mondays and Thursdays, 06:00 UTC
