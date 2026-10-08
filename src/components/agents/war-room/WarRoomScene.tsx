import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, Html, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { WarAgent, WarOrder } from "./useWarRoomData";

const SEATS = 11; // 5 core + 6 specialists
const R = 3.2;
const BRONZE = "#b0793f";
const MARBLE = "#e8e2d6";
const STATUS_COLOR: Record<string, string> = { working: "#f2b84b", idle: "#8a8578", paused: "#5c5a55", error: "#d9483b" };
const ACTION_LABEL: Record<string, string> = {
  order_buy: "Buy", order_sell: "Sell", order_close_all: "Close all", order_engine_cycle: "Scan",
  set_risk_params: "Risk", set_market_mode: "Market", pause_agent: "Pause", hire_agent: "Hire", fire_agent: "Dismiss",
};

function seatPos(i: number): THREE.Vector3 {
  const a = -Math.PI / 2 + ((i + 1) / (SEATS + 1)) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
}
const HEAD = new THREE.Vector3(0, 0.4, -(R + 0.3));

function marbleTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = MARBLE; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,110,95,${Math.random() * 0.18})`; g.lineWidth = Math.random() * 2;
    g.beginPath(); g.moveTo(Math.random() * 256, 0);
    for (let y = 0; y <= 256; y += 32) g.lineTo(Math.random() * 256, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Bust({ agent, pos, big, selected, onSelect }: { agent: WarAgent; pos: THREE.Vector3; big?: boolean; selected: boolean; onSelect: () => void }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const [rise, setRise] = useState(0);
  const color = STATUS_COLOR[agent.status];
  const s = big ? 1.35 : 1;
  useFrame(({ clock }, d) => {
    const dt = Math.min(d, 0.05);
    if (rise < 1) setRise((r) => Math.min(1, r + dt * 0.8));
    if (!group.current) return;
    group.current.lookAt(0, group.current.position.y, 0);
    const t = clock.elapsedTime;
    group.current.position.y = pos.y - 1.2 * (1 - rise) + (agent.status === "working" ? Math.sin(t * 2) * 0.05 : 0);
    if (halo.current) {
      const m = halo.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = agent.status === "working" ? 1.5 + Math.sin(t * 3) : agent.status === "error" ? (Math.random() > 0.5 ? 2.5 : 0.3) : 0.15;
      halo.current.rotation.z += dt * 0.5;
    }
  });
  const stone = agent.status === "paused" ? "#6d6a64" : MARBLE;
  return (
    <group ref={group} position={pos} scale={s} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.32, 0.38, 0.5, 20]} /><meshStandardMaterial color={BRONZE} metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[0, 0.72, 0]} castShadow><sphereGeometry args={[0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={stone} roughness={0.55} /></mesh>
      <mesh position={[0, 0.72, 0]} rotation-x={Math.PI}><circleGeometry args={[0.36, 24]} /><meshStandardMaterial color={stone} /></mesh>
      <mesh position={[0, 1.02, 0]} castShadow><cylinderGeometry args={[0.08, 0.1, 0.16, 12]} /><meshStandardMaterial color={stone} /></mesh>
      <mesh position={[0, 1.27, 0]} castShadow><sphereGeometry args={[0.22, 24, 20]} /><meshStandardMaterial color={stone} roughness={0.5} /></mesh>
      {big && <mesh position={[0, 1.5, 0]}><coneGeometry args={[0.18, 0.22, 5]} /><meshStandardMaterial color={BRONZE} metalness={0.9} roughness={0.25} /></mesh>}
      <mesh ref={halo} position={[0, 1.3, -0.1]}><torusGeometry args={[0.34, 0.025, 8, 40]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} /></mesh>
      <Html position={[0, 1.85, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold border ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background/80 text-foreground border-border"}`}>
          {agent.status === "paused" ? "🔒 " : ""}{agent.name}
        </div>
      </Html>
    </group>
  );
}

function EmptySeat({ pos }: { pos: THREE.Vector3 }) {
  return (
    <mesh position={[pos.x, 0.05, pos.z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.28, 0.36, 32]} /><meshStandardMaterial color={BRONZE} transparent opacity={0.35} />
    </mesh>
  );
}

function Globe({ regime }: { regime: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const up = regime === "trending";
  const down = regime === "high_volatility" || regime === "news_driven";
  const color = up ? "#4caf6a" : down ? "#c4513f" : "#c9a45c";
  const targetY = up ? 1.5 : down ? 0.85 : 1.15;
  useFrame((_, d) => {
    if (!ref.current) return;
    const dt = Math.min(d, 0.05);
    ref.current.rotation.y += dt * 0.4;
    ref.current.position.y += (targetY - ref.current.position.y) * (1 - Math.exp(-2 * dt));
  });
  return (
    <mesh ref={ref} position={[0, 1.1, 0]} castShadow>
      <icosahedronGeometry args={[0.55, 2]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} flatShading metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function Token({ from, to, label, onDone }: { from: THREE.Vector3; to: THREE.Vector3; label: string; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const curve = useMemo(() => {
    const a = from.clone().setY(1.6), b = to.clone().setY(1.6);
    return new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(3), b);
  }, [from, to]);
  useFrame((_, d) => {
    t.current += Math.min(d, 0.05) / 2.2;
    if (t.current >= 1) return onDone();
    ref.current?.position.copy(curve.getPoint(t.current));
  });
  return (
    <group ref={ref}>
      <mesh><octahedronGeometry args={[0.13]} /><meshStandardMaterial color="#f2b84b" emissive="#f2b84b" emissiveIntensity={2} /></mesh>
      <pointLight color="#f2b84b" intensity={3} distance={2} />
      <Html center position={[0, 0.3, 0]} distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded bg-background/90 px-1.5 text-[10px] text-foreground border border-border">{label}</div>
      </Html>
    </group>
  );
}

export interface WarRoomProps {
  commander: WarAgent | null;
  agents: WarAgent[];
  orders: WarOrder[];
  regime: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  compact: boolean;
}

export default function WarRoomScene({ commander, agents, orders, regime, selectedId, onSelect, compact }: WarRoomProps) {
  const tex = useMemo(() => marbleTexture(), []);
  const seen = useRef<Set<string> | null>(null);
  const [flying, setFlying] = useState<{ key: string; to: string; label: string }[]>([]);

  const posById = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    agents.forEach((a, i) => m.set(a.id, seatPos(i)));
    // map specialist names too (hire/fire orders reference names)
    agents.forEach((a, i) => m.set(a.name.toLowerCase(), seatPos(i)));
    return m;
  }, [agents]);

  useEffect(() => {
    if (!orders.length) return;
    const first = seen.current === null;
    if (first) seen.current = new Set();
    const fresh = orders.filter((o) => !seen.current!.has(o.id) && o.action !== "note");
    orders.forEach((o) => seen.current!.add(o.id));
    const pick = first ? fresh.slice(0, 3) : fresh;
    if (!pick.length) return;
    setFlying((f) => [...f, ...pick.reverse().map((o, i) => {
      const nm = typeof o.payload?.name === "string" ? o.payload.name.toLowerCase() : null;
      const to = nm && posById.has(nm) ? nm : (typeof o.payload?.agent === "string" ? o.payload.agent : o.agent);
      const sym = typeof o.payload?.symbol === "string" ? ` ${o.payload.symbol}` : nm ? ` ${o.payload.name}` : "";
      return { key: `${o.id}-${i}`, to, label: `${ACTION_LABEL[o.action] ?? o.action}${sym}` };
    })]);
  }, [orders, posById]);

  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 5.5, 8.5], fov: compact ? 55 : 42 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={["#1a1612"]} />
      <fog attach="fog" args={["#1a1612", 10, 22]} />
      <ambientLight intensity={0.35} />
      <spotLight position={[0, 9, 0]} angle={0.6} penumbra={0.6} intensity={60} color="#ffd9a0" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-5, 2.5, -3]} intensity={8} color="#ff9a4a" distance={10} />
      <pointLight position={[5, 2.5, -3]} intensity={8} color="#ff9a4a" distance={10} />
      <Environment resolution={64}>
        <Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} color="#ffe2b8" />
        <Lightformer intensity={0.6} color="#a88b6a" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>

      {/* floor + table */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[12, 64]} /><meshStandardMaterial map={tex} color="#6b5d4c" roughness={0.8} /></mesh>
      <mesh position={[0, 0.35, 0]} receiveShadow castShadow><cylinderGeometry args={[2.2, 2.4, 0.7, 48]} /><meshStandardMaterial map={tex} roughness={0.45} /></mesh>
      <mesh position={[0, 0.71, 0]}><torusGeometry args={[2.2, 0.04, 8, 64]} /><meshStandardMaterial color={BRONZE} metalness={0.9} roughness={0.3} /></mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        if (Math.sin(a) > 0.3) return null; // keep the camera side open
        return <mesh key={i} position={[Math.cos(a) * 7, 2, Math.sin(a) * 7]} castShadow><cylinderGeometry args={[0.3, 0.35, 4, 16]} /><meshStandardMaterial map={tex} /></mesh>;
      })}
      <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={12} blur={2} far={4} />

      <Globe regime={regime} />

      {/* Kronos on plinth */}
      <mesh position={[HEAD.x, 0.2, HEAD.z]} receiveShadow castShadow><cylinderGeometry args={[0.6, 0.7, 0.4, 32]} /><meshStandardMaterial color={BRONZE} metalness={0.6} roughness={0.4} /></mesh>
      {commander && <Bust agent={commander} pos={HEAD} big selected={selectedId === "commander"} onSelect={() => onSelect("commander")} />}

      {Array.from({ length: SEATS }).map((_, i) => {
        const a = agents[i];
        return a ? <Bust key={a.id} agent={a} pos={seatPos(i)} selected={selectedId === a.id} onSelect={() => onSelect(a.id)} /> : <EmptySeat key={`e${i}`} pos={seatPos(i)} />;
      })}

      {flying.map((f) => (
        <Token key={f.key} from={HEAD} to={posById.get(f.to) ?? new THREE.Vector3(0, 0, 0)} label={f.label}
          onDone={() => setFlying((x) => x.filter((y) => y.key !== f.key))} />
      ))}

      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} maxPolarAngle={Math.PI / 2.2} target={[0, 0.8, 0]} />
    </Canvas>
  );
}
