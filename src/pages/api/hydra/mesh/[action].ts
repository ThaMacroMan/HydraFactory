import type { NextApiRequest, NextApiResponse } from "next";
import { runHydraAction } from "../../../server/hydra";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const action = Array.isArray(req.query.action)
    ? req.query.action[0]
    : req.query.action;

  if (!action) {
    return res.status(400).json({ error: "Action is required" });
  }

  try {
    const result = await runHydraAction(action, req.body ?? {});
    res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error(`hydra:${action}`, error);
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
