import type { NextApiRequest, NextApiResponse } from "next";
import WebSocket from "ws";
import { getWalletApiPort } from "../../../../server/constants";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party, action, port: portParam } = req.query; 
  const partyStr = String(party);

  // Use provided port or calculate it
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

  const validActions = ["init", "close", "fanout"];
  if (!action || typeof action !== "string" || !validActions.includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  // Map action to WebSocket tag
  const actionTagMap: Record<string, string> = {
    init: "Init",
    close: "Close",
    fanout: "Fanout",
  };

  const wsTag = actionTagMap[action];

  // Add comprehensive logging for all actions
  console.log(`[${action}] ========== Starting ${action} action ==========`);
  console.log(`[${action}] Party: ${partyStr}`);
  console.log(`[${action}] Port: ${port}`);
  console.log(`[${action}] WebSocket tag: ${wsTag}`);
  console.log(`[${action}] Request method: ${req.method}`);
  console.log(`[${action}] Request body:`, req.body);

  // For Init action, we need to get the other parties' verification keys
  let otherPartiesVkeys: Array<{ vkey: string }> = [];
  if (action === "init") {
    try {
      // Get otherParties from query parameter or request body
      const otherPartiesParam =
        req.query.otherParties || (req.body as any)?.otherParties;
      let otherParties: string[] = [];

      if (otherPartiesParam) {
        // Handle both array and comma-separated string
        if (Array.isArray(otherPartiesParam)) {
          otherParties = otherPartiesParam.map(String);
        } else if (typeof otherPartiesParam === "string") {
          otherParties = otherPartiesParam.split(",").map((p) => p.trim());
        }
      } else {
        // Fallback: try to get all wallets except current party
        // This is a best-effort approach - ideally otherParties should be passed
        console.warn(
          `[${action}] No otherParties specified, attempting to discover wallets`
        );
      }

      if (otherParties.length > 0) {
        // Use the host from the request to construct the URL
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host || "localhost:3000";
        const baseUrl = `${protocol}://${host}`;

        // Fetch vkeys for all other parties
        const vkeyPromises = otherParties.map(async (otherParty) => {
          try {
            const vkeyResponse = await fetch(
              `${baseUrl}/api/hydra/${otherParty}/vkey`
            );
            if (vkeyResponse.ok) {
              const vkeyData = await vkeyResponse.json();
              return { vkey: vkeyData.vkey };
            }
          } catch (error) {
            console.warn(
              `[${action}] ⚠️ Failed to fetch vkey for ${otherParty}:`,
              error
            );
          }
          return null;
        });

        const vkeys = await Promise.all(vkeyPromises);
        otherPartiesVkeys = vkeys.filter(
          (v): v is { vkey: string } => v !== null
        );

        console.log(
          `[${action}] ✅ Fetched ${otherPartiesVkeys.length} other party vkeys`
        );
      } else {
        console.warn(
          `[${action}] ⚠️ No other parties specified, proceeding without other party vkeys`
        );
      }
    } catch (error) {
      console.warn(`[${action}] ⚠️ Error fetching other party vkeys:`, error);
    }
  }

  try {
    // Try WebSocket first for protocol actions (init, close, fanout)
    // WebSocket uses the same port as HTTP
    // Note: Hydra node processes commands asynchronously - we send the message and return success
    // The status will update when polled via the status endpoint
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);

      let messageReceived = false;
      let responseData: any = null;
      let greetingsReceived = false;
      let commandSent = false;

      const timeout = setTimeout(() => {
        if (!messageReceived && commandSent) {
          console.log(
            `[${action}] ⚠️ WebSocket timeout for ${partyStr} - command was sent, but no response received. This is normal for Hydra as commands are processed asynchronously.`
          );
          ws.close();
          // Return success even without response - Hydra processes commands async
          // The status endpoint will show the actual state
          resolve(
            res.status(200).json({
              message: `Action ${action} sent successfully (processing asynchronously)`,
              tag: wsTag,
              note: "Hydra processes commands asynchronously. Check status endpoint for current state.",
            })
          );
        } else if (!commandSent) {
          console.error(
            `[${action}] ❌ WebSocket timeout for ${partyStr} - never received Greetings message or failed to send command`
          );
          ws.close();
          resolve(
            res.status(500).json({
              error:
                "Failed to establish WebSocket communication with Hydra node",
            })
          );
        }
      }, 5000);

      ws.on("open", () => {
        console.log(
          `[${action}] ✅ WebSocket connection opened for ${partyStr} on ws://127.0.0.1:${port}`
        );
        // Wait for Greetings message before sending command
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log(
            `[${action}] 📥 Received message from ${partyStr}:`,
            response
          );

          // Handle Greetings message - this is sent immediately after connection
          if (response.tag === "Greetings" && !greetingsReceived) {
            greetingsReceived = true;
            console.log(
              `[${action}] ✅ Greetings received, sending command...`
            );
            // Now send the actual command
            // For Init, include other parties' verification keys if available
            let message: any = { tag: wsTag };
            if (action === "init" && otherPartiesVkeys.length > 0) {
              message.otherParties = otherPartiesVkeys;
              console.log(
                `[${action}] 📤 Including ${otherPartiesVkeys.length} other party vkeys in Init message`
              );
            }
            const messageStr = JSON.stringify(message);
            console.log(
              `[${action}] 📤 Sending message to ${partyStr}:`,
              messageStr
            );
            ws.send(messageStr);
            commandSent = true;
            return;
          }

          // Handle response to our command
          if (commandSent && response.tag !== "Greetings") {
            messageReceived = true;
            responseData = response;

            console.log(
              `[${action}] ✅ Received response to command:`,
              response
            );

            // Close connection after receiving response
            clearTimeout(timeout);
            ws.close();

            resolve(
              res.status(200).json({
                message: `Action ${action} completed successfully`,
                tag: wsTag,
                response: responseData,
              })
            );
          }
        } catch (error) {
          console.error(
            `[${action}] ❌ Failed to parse WebSocket response:`,
            error
          );
          // Don't fail here, let timeout handle it
        }
      });

      ws.on("error", (error: any) => {
        console.error(`[${action}] ❌ WebSocket error for ${partyStr}:`, error);
        clearTimeout(timeout);
        ws.close();
        // Fallback to HTTP if WebSocket fails
        tryHttp();
      });

      ws.on("close", () => {
        if (!messageReceived) {
          // If we closed without receiving a message, it might still be processing
          // This is expected behavior for Hydra - commands are async
          console.log(
            `[${action}] ⚠️ WebSocket closed without response - action may still be processing`
          );
          // Don't resolve here if we haven't received a message - let timeout handle it
        }
      });

      function tryHttp() {
        // Fallback to HTTP if WebSocket fails
        console.log(
          `[${action}] 🔄 Attempting HTTP fallback for ${partyStr} to http://127.0.0.1:${port}/${action}`
        );
        const requestOptions: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        };

        if (req.body && Object.keys(req.body).length > 0) {
          requestOptions.body = JSON.stringify(req.body);
        }

        fetch(`http://127.0.0.1:${port}/${action}`, requestOptions)
          .then(async (response) => {
            if (!response.ok) {
              let errorText = "";
              try {
                errorText = await response.text();
              } catch (e) {
                errorText = `HTTP ${response.status}`;
              }
              return Promise.all([Promise.resolve(response.status), errorText]);
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              return Promise.all([
                Promise.resolve(response.status),
                response.json(),
              ]);
            }
            return Promise.all([
              Promise.resolve(response.status),
              response.text(),
            ]);
          })
          .then(([status, data]) => {
            console.log(
              `[${action}] HTTP response status for ${partyStr}:`,
              status
            );
            if (status !== 200) {
              console.error(`[${action}] ❌ HTTP error for ${partyStr}:`, data);
              resolve(
                res.status(status).json({
                  error: typeof data === "string" ? data : "Action failed",
                  status,
                })
              );
            } else {
              console.log(`[${action}] ✅ HTTP success for ${partyStr}:`, data);
              resolve(res.status(200).json(data));
            }
          })
          .catch((error) => {
            console.error(
              `[${action}] ❌ HTTP request failed for ${partyStr}:`,
              error
            );
            resolve(
              res.status(500).json({
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to execute action",
              })
            );
          });
      }
    });
  } catch (error) {
    console.error(
      `[${action}] ❌ Exception in action handler for ${partyStr}:`,
      error
    );
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to execute action",
    });
  }
}
