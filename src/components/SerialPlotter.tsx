import { Component, createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { stripAnsi } from "../services/ansi";

export interface SerialPlotterProps {
  logs: string[];
}

interface ChannelPoint {
  name: string;
  value: number;
}

const CHANNEL_COLORS = [
  "#00F0FF", // Cyan
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#38BDF8", // Sky Blue
  "#EF4444", // Red
  "#34D399", // Mint
];

const MAX_HISTORY = 120;

export const SerialPlotter: Component<SerialPlotterProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let animationId: number | null = null;
  let lastProcessedIndex = 0;

  // Channel names and rolling history: Map<channelName, number[]>
  const historyMap = new Map<string, number[]>();
  const [channelNames, setChannelNames] = createSignal<string[]>([]);
  const [latestValues, setLatestValues] = createSignal<Record<string, number>>({});
  const [hasData, setHasData] = createSignal(false);

  // Parse lines for numbers
  const parseLine = (rawLine: string): ChannelPoint[] => {
    const line = stripAnsi(rawLine).trim();
    if (!line) return [];

    // Check for labeled format: e.g. "temp: 24.5 hum: 60" or "sin: 1.2, cos: 3.4"
    const labeledRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(-?\d+(?:\.\d+)?)/g;
    let match: RegExpExecArray | null;
    const labeledPoints: ChannelPoint[] = [];

    while ((match = labeledRegex.exec(line)) !== null) {
      const val = parseFloat(match[2]);
      if (!isNaN(val)) {
        labeledPoints.push({ name: match[1], value: val });
      }
    }

    if (labeledPoints.length > 0) {
      return labeledPoints;
    }

    // Check for comma, tab, or space delimited numbers: e.g. "123, 456, 789"
    const tokens = line.split(/[,\t ]+/).map((t) => t.trim()).filter(Boolean);
    const numericPoints: ChannelPoint[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const val = parseFloat(tokens[i]);
      if (!isNaN(val) && isFinite(val)) {
        numericPoints.push({
          name: tokens.length === 1 ? "Value" : `Ch ${i + 1}`,
          value: val,
        });
      } else {
        // If non-numeric token found and no numbers yet, not a numeric data line
        if (numericPoints.length === 0) return [];
      }
    }

    return numericPoints;
  };

  // Ingest new logs
  createEffect(() => {
    const logs = props.logs;
    const len = logs.length;

    if (len === 0) {
      historyMap.clear();
      setChannelNames([]);
      setLatestValues({});
      setHasData(false);
      lastProcessedIndex = 0;
      return;
    }

    // Only process newly added lines
    const start = Math.max(0, lastProcessedIndex);
    const newLatest: Record<string, number> = { ...latestValues() };
    let dataAdded = false;

    for (let i = start; i < len; i++) {
      const points = parseLine(logs[i]);
      if (points.length > 0) {
        dataAdded = true;
        for (const pt of points) {
          if (!historyMap.has(pt.name)) {
            historyMap.set(pt.name, []);
          }
          const arr = historyMap.get(pt.name)!;
          arr.push(pt.value);
          if (arr.length > MAX_HISTORY) {
            arr.shift();
          }
          newLatest[pt.name] = pt.value;
        }
      }
    }

    lastProcessedIndex = len;

    if (dataAdded) {
      setChannelNames(Array.from(historyMap.keys()));
      setLatestValues(newLatest);
      setHasData(true);
    }
  });

  // Canvas render loop
  const renderCanvas = () => {
    if (!canvasRef || !containerRef) return;
    const canvas = canvasRef;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.clientWidth;
    const height = containerRef.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0D0D0F";
    ctx.fillRect(0, 0, width, height);

    const names = Array.from(historyMap.keys());
    if (names.length === 0) {
      ctx.restore();
      return;
    }

    // Compute global min and max across all channels
    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (const name of names) {
      const arr = historyMap.get(name)!;
      for (const val of arr) {
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      }
    }

    if (!isFinite(globalMin) || !isFinite(globalMax)) {
      ctx.restore();
      return;
    }

    // Padding for min/max
    if (globalMin === globalMax) {
      globalMin -= 1;
      globalMax += 1;
    } else {
      const range = globalMax - globalMin;
      globalMin -= range * 0.08;
      globalMax += range * 0.08;
    }

    const padLeft = 50;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 24;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    // Draw horizontal grid lines
    const gridSteps = 4;
    ctx.strokeStyle = "#1F1F23";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#71717A";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= gridSteps; i++) {
      const yVal = globalMin + (i / gridSteps) * (globalMax - globalMin);
      const yPos = padTop + plotH - (i / gridSteps) * plotH;

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(width - padRight, yPos);
      ctx.stroke();

      const label = yVal >= 1000 || yVal <= -1000 ? yVal.toFixed(0) : yVal.toFixed(1);
      ctx.fillText(label, padLeft - 6, yPos);
    }

    // Plot each channel
    names.forEach((name, chIdx) => {
      const arr = historyMap.get(name)!;
      if (arr.length < 2) return;

      const color = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      const stepX = plotW / (MAX_HISTORY - 1);
      const startOffset = MAX_HISTORY - arr.length;

      for (let i = 0; i < arr.length; i++) {
        const x = padLeft + (startOffset + i) * stepX;
        const normalizedY = (arr[i] - globalMin) / (globalMax - globalMin);
        const y = padTop + plotH - normalizedY * plotH;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

    ctx.restore();
  };

  const scheduleFrame = () => {
    renderCanvas();
    animationId = requestAnimationFrame(scheduleFrame);
  };

  onMount(() => {
    animationId = requestAnimationFrame(scheduleFrame);
  });

  onCleanup(() => {
    if (animationId !== null) cancelAnimationFrame(animationId);
  });

  return (
    <div ref={containerRef} class="flex-1 w-full h-full relative flex flex-col bg-[#0D0D0F] select-none">
      {/* Top Legend Bar */}
      <Show when={channelNames().length > 0}>
        <div class="h-7 px-3 bg-[#141416]/80 border-b border-[#27272A] flex items-center gap-3 overflow-x-auto shrink-0 font-mono text-[11px]">
          <For each={channelNames()}>
            {(name, idx) => {
              const color = CHANNEL_COLORS[idx() % CHANNEL_COLORS.length];
              const val = () => latestValues()[name];
              return (
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ "background-color": color }} />
                  <span class="text-[#D4D4D8] font-medium">{name}:</span>
                  <span class="text-white font-bold">{val() !== undefined ? val().toFixed(2) : "0.00"}</span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Canvas Viewport */}
      <Show
        when={hasData()}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#71717A]">
            <p class="text-sm font-sans font-medium text-[#A1A1AA]">Waiting for numeric serial data...</p>
            <p class="text-xs font-mono mt-1 text-[#52525B]">
              Print numeric values in your sketch: <span class="text-[#00F0FF]">Serial.println(sensorValue);</span> or <span class="text-[#00F0FF]">Serial.printf("temp:%f hum:%f\n", t, h);</span>
            </p>
          </div>
        }
      >
        <canvas ref={canvasRef} class="w-full flex-1 block" />
      </Show>
    </div>
  );
};
