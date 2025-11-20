import { useMemo, memo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TransactionLogEntry } from "./TransactionLog";

interface TransactionChartProps {
  transactions: TransactionLogEntry[];
  hydraHistory: TransactionLogEntry[];
}

function TransactionChart({
  transactions,
  hydraHistory,
}: TransactionChartProps) {
  // Memoize the combined transactions list
  const allTransactions = useMemo(() => {
    return [...hydraHistory, ...transactions]
      .filter(
        (tx, index, self) =>
          index ===
          self.findIndex(
            (t) => (tx.txId && t.txId && tx.txId === t.txId) || tx.id === t.id
          )
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [hydraHistory, transactions]);

  // Process data for chart - one point per transaction
  // Use a ref to track the last processed transaction count to only add new points
  const lastProcessedCountRef = useRef(0);
  const previousDataRef = useRef<any[]>([]);
  const lastAllTransactionsRef = useRef<TransactionLogEntry[]>([]);

  const chartData = useMemo(() => {
    if (allTransactions.length === 0) {
      lastProcessedCountRef.current = 0;
      previousDataRef.current = [];
      lastAllTransactionsRef.current = [];
      return [];
    }

    // Quick check: if transactions array reference hasn't changed and length is same, return cached data
    // This prevents recalculation when component re-renders but data hasn't changed
    if (
      lastAllTransactionsRef.current === allTransactions &&
      previousDataRef.current.length > 0
    ) {
      return previousDataRef.current;
    }

    // Filter to only confirmed/successful transactions and sort by timestamp
    const confirmedTxs = allTransactions
      .filter((tx) => tx.status === "confirmed" || tx.status === "success")
      .sort((a, b) => a.timestamp - b.timestamp);

    if (confirmedTxs.length === 0) {
      lastProcessedCountRef.current = 0;
      previousDataRef.current = [];
      lastAllTransactionsRef.current = allTransactions;
      return [];
    }

    // If we have previous data and new transactions were added, only process new ones
    // This is the key optimization: append new points instead of recalculating everything
    if (
      previousDataRef.current.length > 0 &&
      confirmedTxs.length > lastProcessedCountRef.current
    ) {
      const newTxs = confirmedTxs.slice(lastProcessedCountRef.current);
      const previousLastTx = confirmedTxs[lastProcessedCountRef.current - 1];

      // Add new data points - only process the new transactions
      const newDataPoints = newTxs.map((tx, index) => {
        const globalIndex = lastProcessedCountRef.current + index;
        // Calculate speed (time since previous transaction in milliseconds)
        let speed = 0;
        if (globalIndex > 0) {
          const prevTx =
            globalIndex === lastProcessedCountRef.current
              ? previousLastTx
              : confirmedTxs[globalIndex - 1];
          speed = tx.timestamp - prevTx.timestamp;
        }

        return {
          time: new Date(tx.timestamp).toLocaleTimeString(),
          timestamp: tx.timestamp,
          totalTransactions: globalIndex + 1,
          speed: speed,
          txId: tx.txId || tx.id,
        };
      });

      // Append new points to previous data - this is the fast path
      const updatedData = [...previousDataRef.current, ...newDataPoints];
      lastProcessedCountRef.current = confirmedTxs.length;
      previousDataRef.current = updatedData;
      lastAllTransactionsRef.current = allTransactions;
      return updatedData;
    }

    // First time or full recalculation needed (should be rare)
    const data = confirmedTxs.map((tx, index) => {
      // Calculate speed (time since previous transaction in milliseconds)
      let speed = 0; // First transaction has no previous
      if (index > 0) {
        speed = tx.timestamp - confirmedTxs[index - 1].timestamp;
      }

      return {
        time: new Date(tx.timestamp).toLocaleTimeString(),
        timestamp: tx.timestamp,
        totalTransactions: index + 1, // Cumulative count
        speed: speed, // Time in milliseconds since previous transaction
        txId: tx.txId || tx.id,
      };
    });

    lastProcessedCountRef.current = confirmedTxs.length;
    previousDataRef.current = data;
    lastAllTransactionsRef.current = allTransactions;
    return data;
  }, [allTransactions]);

  if (chartData.length === 0) {
    return (
      <div className="bg-blue-950/40 rounded-xl border border-blue-900/60 p-4 h-full flex flex-col">
        <h3 className="text-lg font-bold text-white mb-3">Txns and Speed</h3>
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
          No transaction data available yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-950/40 rounded-xl border border-blue-900/60 p-4 h-full flex flex-col">
      <h3 className="text-lg font-bold text-white mb-3">Txns and Speed</h3>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            // Disable animations for faster rendering - just append new points
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis
              dataKey="time"
              stroke="#93c5fd"
              fontSize={10}
              tick={{ fill: "#93c5fd" }}
              angle={-45}
              textAnchor="end"
              height={60}
              // Only update axis when data length changes significantly
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              stroke="#60a5fa"
              fontSize={10}
              tick={{ fill: "#60a5fa" }}
              label={{
                value: "Total Transactions",
                angle: -90,
                position: "outside",
                fill: "#60a5fa",
                fontSize: 12,
                offset: -10,
              }}
              // Don't recalculate domain on every update - use dataMin/dataMax
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#34d399"
              fontSize={10}
              tick={{ fill: "#34d399" }}
              label={{
                value: "Speed (ms)",
                angle: 90,
                position: "outside",
                fill: "#34d399",
                fontSize: 12,
                offset: -10,
              }}
              domain={["dataMin", "dataMax"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1F2937",
                border: "1px solid #374151",
                borderRadius: "6px",
                color: "#e0e7ff",
              }}
              labelStyle={{ color: "#93c5fd" }}
              formatter={(value: any, name: string) => {
                if (name === "totalTransactions") {
                  return [`${value}`, "Total Transactions"];
                }
                if (name === "speed") {
                  if (value === 0) {
                    return ["First transaction", "Speed"];
                  }
                  return [`${value.toFixed(0)} ms`, "Time since previous"];
                }
                return value;
              }}
              labelFormatter={(label, payload) => {
                if (payload && payload[0]) {
                  const data = payload[0].payload;
                  return `${label} - TX #${data.totalTransactions}`;
                }
                return label;
              }}
            />
            <Legend wrapperStyle={{ color: "#9CA3AF", fontSize: "12px" }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="totalTransactions"
              stroke="#60a5fa"
              strokeWidth={2}
              name="Total Transactions"
              dot={{ r: 4, fill: "#60a5fa" }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              // Disable animations for instant rendering
              isAnimationActive={false}
              // Use key to help React identify when to update
              key={`line-total-${chartData.length}`}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="speed"
              stroke="#34d399"
              strokeWidth={2}
              name="Speed (ms)"
              dot={{ r: 4, fill: "#34d399" }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              // Disable animations for instant rendering
              isAnimationActive={false}
              key={`line-speed-${chartData.length}`}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Memoize component to prevent re-renders when props haven't changed
// But allow re-render when new transactions are added (so we can append points)
export default memo(TransactionChart, (prevProps, nextProps) => {
  // Always allow re-render if transaction counts increased (new data to add)
  const prevTotal =
    prevProps.transactions.length + prevProps.hydraHistory.length;
  const nextTotal =
    nextProps.transactions.length + nextProps.hydraHistory.length;

  if (nextTotal > prevTotal) {
    return false; // New transactions added, allow re-render to append points
  }

  // If counts are same, check if any transaction status changed
  if (prevTotal === nextTotal) {
    const prevTxIds = new Set(
      [...prevProps.transactions, ...prevProps.hydraHistory].map(
        (tx) => tx.txId || tx.id
      )
    );
    const nextTxIds = new Set(
      [...nextProps.transactions, ...nextProps.hydraHistory].map(
        (tx) => tx.txId || tx.id
      )
    );

    if (prevTxIds.size !== nextTxIds.size) return false;

    // Check if any transaction status changed
    const prevMap = new Map(
      [...prevProps.transactions, ...prevProps.hydraHistory].map((tx) => [
        tx.txId || tx.id,
        tx,
      ])
    );
    const hasStatusChange = [
      ...nextProps.transactions,
      ...nextProps.hydraHistory,
    ].some((tx) => {
      const prev = prevMap.get(tx.txId || tx.id);
      return !prev || prev.status !== tx.status;
    });

    if (hasStatusChange) return false; // Status changed, allow re-render
  }

  // No changes, skip re-render
  return true;
});
