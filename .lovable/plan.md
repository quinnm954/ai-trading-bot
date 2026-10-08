# 3D "War Room" on the Agent Console

A live 3D scene at the top of the Agent Console showing Kronos and his team at work.

## What you'll see
- **A round command table** in a dim, marble-and-bronze Greek war room (warm lamp light, no neon).
- **Kronos** stands at the head of the table on a raised plinth. The five core agents (Argus, Athena, Themis, Hermes, Asclepius) and any hired specialists sit around it, each as a stylised bust/statue with its name floating above.
- **Status shows on each agent:**
  - Working: glowing halo and a gentle pulse
  - Idle: dim and still
  - Paused: greyed out with a small lock
  - Error: flickering red ember
- **Orders fly across the table:** when Kronos issues an order (buy, sell, pause, hire), a glowing token travels from him to the agent who carries it out, labelled with the action (for example "Buy SOL").
- **A market globe** in the centre of the table rises and turns green when the market is rising, and sinks and turns red when it's falling.
- **Hiring and dismissing:** new specialists rise from the floor into an empty seat; dismissed ones fade out. Empty seats show how much room is left (up to 12).
- **Click an agent** to see a card with its current task, last report and latest orders.
- You can drag to orbit and zoom. On phones the scene is shorter and simpler, and it can be collapsed.

## Data
It uses the information the console already reads: each agent's status and current task, the Commander's orders, hired specialists and their reports, plus the market direction. It refreshes every 30 seconds, so nothing new is added to the backend.

## Technical details
- Add `three`, `@react-three/fiber@^8.18`, `@react-three/drei@^9.122` (the app runs React 18).
- New `src/components/agents/war-room/`: `WarRoomCanvas.tsx` (Canvas, local Lightformer environment, fog, shadows, DPR capped at 1.5), `AgentBust.tsx` (procedural stylised bust with status materials), `OrderToken.tsx` (bezier-path animation driven by new `commander_orders` rows), `MarketGlobe.tsx`, `AgentDetailCard.tsx` (DOM overlay).
- `useWarRoomData` hook combines agent_state, commander_orders, commander_specialists and the latest regime/tape signal.
- The scene is lazy-loaded and wrapped in Suspense with a fallback, so the console still loads fast and works without WebGL.
- Mounted above `CommanderPanel` in `AgentConsole.tsx`.
- Checked with screenshots in the sandbox browser to confirm it actually draws, not a black canvas.
