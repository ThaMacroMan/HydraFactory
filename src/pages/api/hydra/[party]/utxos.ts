import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party, port: portParam } = req.query;
  const partyStr = String(party);

  // Use provided port or calculate it
  const { getWalletApiPort } = await import("../../../../server/constants");
  let port: number | null = null;
  if (portParam) {
    port = parseInt(String(portParam), 10);
  } else {
    port = await getWalletApiPort(partyStr);
  }

  if (!port) {
    return res
      .status(400)
      .json({ error: "Invalid party or unable to determine port" });
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/snapshot/utxo`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch UTXOs",
    });
  }
}
