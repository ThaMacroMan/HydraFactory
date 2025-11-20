import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  console.log(
    `[transaction] ${req.method} request received for party: ${req.query.party}`
  );

  if (req.method !== "POST") {
    console.log(`[transaction] Method not allowed: ${req.method}`);
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
    console.error(`[transaction] Invalid party or unable to determine port: ${partyStr}`);
    return res.status(400).json({ error: "Invalid party or unable to determine port" });
  }

  const { transaction } = req.body;

  if (!transaction || typeof transaction !== "string") {
    console.error(
      `[transaction] Missing or invalid transaction CBOR. Type: ${typeof transaction}, Has value: ${!!transaction}`
    );
    return res.status(400).json({ error: "Transaction CBOR hex is required" });
  }

  console.log(
    `[transaction] Submitting transaction to ${party} (port ${port})`
  );
  console.log(`[transaction] Transaction CBOR length: ${transaction.length}`);
  console.log(
    `[transaction] Transaction CBOR (first 100 chars): ${transaction.substring(
      0,
      100
    )}...`
  );

  try {
    // Try /transaction endpoint first (newer API format)
    let hydraUrl = `http://127.0.0.1:${port}/transaction`;
    let requestBody: { cborHex?: string; transaction?: string } = {
      cborHex: transaction,
    };

    console.log(`[transaction] Trying /transaction endpoint: ${hydraUrl}`);
    console.log(
      `[transaction] Request body:`,
      JSON.stringify(requestBody).substring(0, 150)
    );

    let response = await fetch(hydraUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    // Store first error in case we need it (response body can only be read once)
    let firstErrorText: string | null = null;
    let firstErrorData: any = null;
    
    // If /transaction doesn't work, try /new-transaction (older API format)
    // BUT: Don't fallback for validation errors (400) - those are real errors we should return
    if (!response.ok) {
      firstErrorText = await response.text();
      
      try {
        firstErrorData = JSON.parse(firstErrorText);
      } catch {
        // Not JSON, continue
      }
      
      // If it's a validation error (400 with SubmitTxInvalid), return it immediately
      // Don't try fallback for validation errors - they're legitimate transaction failures
      if (response.status === 400 && firstErrorData?.tag === "SubmitTxInvalid") {
        console.log(
          `[transaction] /transaction validation error (400), not trying fallback:`,
          firstErrorText
        );
        // Will be handled by error handling below - use firstErrorData
      } else if (response.status === 404 || response.status === 501) {
        // Only try fallback for "not found" or "not implemented" errors
        console.log(
          `[transaction] /transaction failed (${response.status}), trying /new-transaction:`,
          firstErrorText
        );

        hydraUrl = `http://127.0.0.1:${port}/new-transaction`;
        requestBody = { transaction };

        response = await fetch(hydraUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      } else {
        // For other errors, log but don't try fallback
        console.log(
          `[transaction] /transaction failed (${response.status}), not trying fallback:`,
          firstErrorText
        );
      }
    }

    console.log(
      `[transaction] Response status: ${response.status} ${response.statusText}`
    );
    console.log(`[transaction] Final endpoint used: ${hydraUrl}`);

    if (!response.ok) {
      let errorText: string;
      let errorData: any = null;
      
      // Use first error if we have it (from first attempt), otherwise read from current response
      if (firstErrorText !== null && firstErrorData !== null) {
        errorText = firstErrorText;
        errorData = firstErrorData;
      } else {
        try {
          errorText = await response.text();
          // Try to parse as JSON for structured error
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Not JSON, use as plain text
          }
        } catch (textError) {
          errorText = `Failed to read error response: ${textError}`;
        }
      }
      
      console.error(`[transaction] Hydra node error response (${response.status}):`, errorText);
      console.error(
        `[transaction] Response headers:`,
        Object.fromEntries(response.headers.entries())
      );
      
      // Extract meaningful error message
      let errorMessage = errorData?.error || errorData?.message || errorText || `HTTP ${response.status}: ${response.statusText}`;
      
      // Handle validation errors with user-friendly messages
      if (errorData?.tag === "SubmitTxInvalid") {
        const validationError = errorData.validationError || "";
        
        // Check for specific validation error types
        if (validationError.includes("BadInputsUTxO")) {
          errorMessage = "The UTXO you're trying to spend doesn't exist in the Hydra head. It may have already been spent or the head state is out of sync.";
        } else if (validationError.includes("ValueNotConserved")) {
          errorMessage = "Transaction value is not conserved. Inputs and outputs don't match.";
        } else if (validationError.includes("FeeTooSmall")) {
          errorMessage = "Transaction fee is too small.";
        } else if (validationError.includes("UtxoFailure")) {
          errorMessage = `Transaction validation failed: ${validationError}`;
        } else {
          errorMessage = `Transaction validation failed: ${validationError || "Invalid transaction"}`;
        }
        
        console.error(`[transaction] Validation error details:`, validationError);
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;
    console.log(
      `[transaction] Successfully submitted transaction in ${duration}ms`
    );
    console.log(
      `[transaction] Response data:`,
      JSON.stringify(data).substring(0, 200)
    );

    return res.status(200).json(data);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Failed to submit transaction";
    
    // Determine appropriate status code
    let statusCode = 500;
    if (error instanceof Error && (error as any).status) {
      statusCode = (error as any).status;
    } else if (errorMessage.includes("400") || errorMessage.includes("Bad Request")) {
      statusCode = 400;
    } else if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
      statusCode = 404;
    } else if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
      statusCode = 503;
    }
    
    console.error(`[transaction] Error after ${duration}ms:`, errorMessage);
    if (error instanceof Error) {
      console.error(`[transaction] Error stack:`, error.stack);
    }

    return res.status(statusCode).json({
      error: errorMessage,
      party: partyStr,
      port: port,
      duration: `${duration}ms`,
    });
  }
}
