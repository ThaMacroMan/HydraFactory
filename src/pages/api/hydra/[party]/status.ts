import type { NextApiRequest, NextApiResponse } from "next";
import { getWalletApiPort } from "../../../../server/constants";

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
  let port: number | null = null;
  if (portParam) {
    port = parseInt(String(portParam), 10);
  } else {
    port = await getWalletApiPort(partyStr);
  }

  if (!port) {
    return res.status(400).json({ error: "Invalid party or unable to determine port" });
  }

  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`http://127.0.0.1:${port}/head`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Try to get error details from the Hydra node
      let errorMessage = `Hydra node returned error ${response.status}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          try {
            const parsed = JSON.parse(errorData);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } catch {
            errorMessage = errorData.substring(0, 200); // Limit error message length
          }
        }
      } catch (parseError) {
        // Use status text if available
        errorMessage = response.statusText || errorMessage;
      }
      
      // Return appropriate status code based on the error
      const statusCode = response.status >= 500 ? 503 : response.status;
      return res.status(statusCode).json({
        error: errorMessage,
        status: response.status,
        party,
      });
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    // Handle different types of errors
    if (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message?.includes('aborted')) {
      return res.status(504).json({
        error: `Request timeout: The Hydra node for ${party} did not respond in time. Please check if the node is running.`,
        party,
        timeout: true,
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      return res.status(503).json({
        error: `Connection refused: Unable to connect to ${party}'s Hydra node. Please check if the node is running on port ${port}.`,
        party,
        port,
        connectionError: true,
      });
    }
    
    if (error.message?.includes('fetch')) {
      return res.status(503).json({
        error: `Network error: Failed to connect to ${party}'s Hydra node. Please check if the node is running.`,
        party,
        networkError: true,
      });
    }
    
    // Generic error
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch status from Hydra node",
      party,
      details: error instanceof Error ? error.stack : undefined,
    });
  }
}

