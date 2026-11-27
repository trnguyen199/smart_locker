import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Text } from "@react-three/drei";
import TouchDisplay from "./TouchDisplay";
import * as THREE from "three";
import type { LockerStatus, BankStatus, Mode } from "../../../shared/types";
const STEP = 1.32;
function ThermalEffect({ mode, power }: { mode: Mode; power: number }) {
  const ribbons = useRef<THREE.Mesh[]>([]);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const fan = useRef<THREE.Group>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const cooling = mode === "COOL";
  const color = cooling ? "#57d9f1" : "#ff9670";
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const strength = 0.8 + 0.2 * Math.min(1, Math.abs(power));
    if (glow.current)
      glow.current.opacity =
        (0.24 + (reducedMotion ? 0 : 0.06 * Math.sin(t * 2.2))) * strength;
    if (fan.current && !reducedMotion)
      fan.current.rotation.z += dt * (cooling ? -4.5 : 4.5);
    ribbons.current.forEach((mesh, i) => {
      if (!mesh) return;
      const travel =
        ((((reducedMotion ? 0 : t * (cooling ? -0.48 : 0.6)) + i * 0.31) % 1) +
          1) %
        1;
      mesh.position.set(
        -0.38 + i * 0.15 + (reducedMotion ? 0 : 0.02 * Math.sin(t * 2 + i)),
        -0.34 + travel * 0.7,
        0.1 + (i % 2) * 0.035,
      );
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = (0.17 + 0.43 * Math.sin(Math.PI * travel)) * strength;
    });
  });
  return (
    <group>
      <mesh position={[0, 0, -0.315]} raycast={() => {}}>
        <planeGeometry args={[1.01, 1]} />
        <meshBasicMaterial
          ref={glow}
          color={color}
          transparent
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            if (mesh) ribbons.current[i] = mesh;
          }}
          raycast={() => {}}
        >
          <planeGeometry
            args={[cooling ? 0.035 : 0.055, 0.2 + (i % 3) * 0.04]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {[-0.49, 0.49].map((x) => (
        <mesh key={x} position={[x, 0, 0.46]} raycast={() => {}}>
          <planeGeometry args={[0.037, 0.92]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.9}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[-0.47, 0.47].map((y) => (
        <mesh key={y} position={[0, y, 0.46]} raycast={() => {}}>
          <planeGeometry args={[0.99, 0.035]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.445]} raycast={() => {}}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>
      <group ref={fan} position={[0.38, -0.39, 0.18]}>
        <mesh raycast={() => {}}>
          <circleGeometry args={[0.025, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            rotation={[0, 0, (i * Math.PI) / 2]}
            position={[0, 0, -0.005]}
            raycast={() => {}}
          >
            <planeGeometry args={[0.025, 0.16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function Panel({
  position,
  size,
  color,
  metalness = 0.35,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  metalness?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={0.46}
      />
    </mesh>
  );
}
function Cell({
  locker,
  selected,
  onSelect,
}: {
  locker: LockerStatus;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const hinge = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (hinge.current)
      hinge.current.rotation.y = THREE.MathUtils.damp(
        hinge.current.rotation.y,
        locker.doorOpen ? 1.65 : 0,
        6,
        dt,
      );
  });
  const x = (locker.column - 1) * STEP,
    y = (1 - locker.row) * STEP;
  return (
    <group
      position={[x, y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(locker.id);
      }}
    >
      <Panel
        position={[0, 0, -0.36]}
        size={[1.12, 1.1, 0.08]}
        color="#e1ecf0"
      />
      <Panel
        position={[-0.55, 0, 0]}
        size={[0.045, 1.1, 0.72]}
        color="#f2f6f5"
      />
      <Panel
        position={[0.55, 0, 0]}
        size={[0.045, 1.1, 0.72]}
        color="#f2f6f5"
      />
      <Panel
        position={[0, 0.53, 0]}
        size={[1.12, 0.045, 0.72]}
        color="#f2f6f5"
      />
      <Panel
        position={[0, -0.53, 0]}
        size={[1.12, 0.045, 0.72]}
        color="#f2f6f5"
      />
      <Panel
        position={[0, -0.34, -0.04]}
        size={[0.95, 0.04, 0.5]}
        color="#9cb3bb"
      />
      {locker.parcel === "LOADED" && (
        <Panel
          position={[0, -0.18, -0.04]}
          size={[0.45, 0.29, 0.36]}
          color="#b88452"
          metalness={0}
        />
      )}
      {locker.mode !== "OFF" && (
        <ThermalEffect mode={locker.mode} power={locker.power} />
      )}
      <group ref={hinge} position={[0.53, 0, 0.39]}>
        <mesh position={[-0.53, 0, 0.01]}>
          <boxGeometry args={[1.06, 1.06, 0.025]} />
          <meshPhysicalMaterial
            color="#a6e8f5"
            transparent
            opacity={0.28}
            metalness={0.12}
            roughness={0.08}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <Panel
          position={[-0.53, 0.52, 0.035]}
          size={[1.09, 0.045, 0.06]}
          color="#f4f8f7"
        />
        <Panel
          position={[-0.53, -0.52, 0.035]}
          size={[1.09, 0.045, 0.06]}
          color="#f4f8f7"
        />
        <Panel
          position={[-1.05, 0, 0.035]}
          size={[0.045, 1.06, 0.06]}
          color="#f4f8f7"
        />
        <Panel
          position={[-0.01, 0, 0.035]}
          size={[0.045, 1.06, 0.06]}
          color="#f4f8f7"
        />
        <Panel
          position={[-0.96, -0.04, 0.09]}
          size={[0.025, 0.17, 0.04]}
          color="#173c50"
        />
      </group>
      <mesh position={[0.39, 0.36, 0.45]}>
        <sphereGeometry args={[0.052, 16, 16]} />
        <meshStandardMaterial
          color={
            locker.mode === "HEAT"
              ? "#ff693e"
              : locker.mode === "COOL"
                ? "#18d8e5"
                : "#8ea5af"
          }
          emissive={
            locker.mode === "HEAT"
              ? "#d74b2c"
              : locker.mode === "COOL"
                ? "#08c5dc"
                : "#000000"
          }
          emissiveIntensity={locker.mode === "OFF" ? 0 : 3.5}
        />
      </mesh>
      {locker.mode !== "OFF" && (
        <>
          <mesh position={[0.39, 0.36, 0.46]} raycast={() => {}}>
            <circleGeometry args={[0.115, 24]} />
            <meshBasicMaterial
              color={locker.mode === "COOL" ? "#26d9ff" : "#ff7349"}
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
          {selected && (
            <pointLight
              position={[0.12, 0.05, 0.28]}
              color={locker.mode === "COOL" ? "#28ccff" : "#ff7045"}
              intensity={3.2}
              distance={1.8}
              decay={2}
            />
          )}
        </>
      )}
      {selected && (
        <mesh position={[0, 0, -0.4]}>
          <boxGeometry args={[1.15, 1.13, 0.025]} />
          <meshBasicMaterial color="#00aacf" transparent opacity={0.25} />
        </mesh>
      )}
      <Text
        position={[-0.39, 0.37, 0.44]}
        fontSize={0.125}
        color="#17394b"
        anchorX="left"
      >
        {`TỦ ${locker.id}`}
      </Text>
      <Text
        position={[-0.39, -0.37, 0.44]}
        fontSize={0.095}
        color="#2a576d"
        anchorX="left"
      >
        {`${locker.temperature.toFixed(1)}°C`}
      </Text>
      <mesh position={[0, 0, 0.38]}>
        <planeGeometry args={[1.1, 1.08]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
function SideStation({
  lockers,
  kioskSelected,
  onScreenSelect,
  onBack,
  selected,
  code,
  screenFeedback,
  onKey,
  onPlace,
  onClose,
  blocked,
  secondsToClose,
  vending,
  onDispense,
  disabled,
}: {
  lockers: LockerStatus[];
  kioskSelected: string | null;
  onScreenSelect: (id: string) => void;
  onBack: () => void;
  selected: string;
  code: string;
  screenFeedback: string;
  onKey: (key: string) => void;
  onPlace: () => void;
  onClose: () => void;
  blocked: number;
  secondsToClose: number;
  vending: BankStatus["vending"];
  onDispense: (id: string) => void;
  disabled: boolean;
}) {
  const palette = ["#2da9d1", "#e5b569", "#ee7970", "#a4c96d"];
  return (
    <group position={[3.35, -0.1, 0]}>
      <Panel
        position={[0, -0.25, -0.28]}
        size={[2.05, 5.1, 0.85]}
        color="#687e8f"
      />
      <Panel
        position={[0, 2.4, 0.17]}
        size={[1.86, 0.33, 0.07]}
        color="#143c55"
      />
      <Text position={[0, 2.4, 0.22]} fontSize={0.14} color="#e7f6f8">
        TRẠM KIOSK OTP
      </Text>
      <Panel
        position={[0, 1.25, 0.2]}
        size={[1.72, 1.9, 0.08]}
        color="#172939"
      />
      <mesh position={[0, 1.25, 0.25]}>
        <boxGeometry args={[1.64, 1.82, 0.025]} />
        <meshPhysicalMaterial
          color="#14384d"
          metalness={0.12}
          roughness={0.13}
          clearcoat={1}
          clearcoatRoughness={0.08}
        />
      </mesh>
      <TouchDisplay
        lockers={lockers}
        kioskSelected={kioskSelected}
        onScreenSelect={onScreenSelect}
        onBack={onBack}
        selected={selected}
        code={code}
        screenFeedback={screenFeedback}
        onKey={onKey}
        onPlace={onPlace}
        onClose={onClose}
        blocked={blocked}
        secondsToClose={secondsToClose}
        disabled={disabled}
      />
      <Panel
        position={[0, -1.62, 0.17]}
        size={[1.8, 2.12, 0.08]}
        color="#183345"
      />
      <Panel
        position={[0, -1.61, 0.23]}
        size={[1.66, 1.93, 0.025]}
        color="#46606b"
      />
      <pointLight
        position={[0, -1.55, 0.55]}
        color="#c4f2fa"
        intensity={0.7}
        distance={3}
      />
      {[-0.85, -1.49, -2.13].map((y) => (
        <Panel
          key={y}
          position={[0, y, 0.31]}
          size={[1.56, 0.035, 0.38]}
          color="#a3b8bf"
        />
      ))}
      {vending.map((item, i) => {
        const x = -0.51 + (i % 2) * 1.02,
          y = -1.12 - Math.floor(i / 2) * 0.68,
          color = palette[i % 4];
        return (
          <group
            key={item.id}
            position={[x, y, 0.43]}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled && item.stock) onDispense(item.id);
            }}
          >
            {item.kind === "DRINK" ? (
              <>
                <mesh>
                  <cylinderGeometry args={[0.115, 0.13, 0.4, 16]} />
                  <meshStandardMaterial
                    color={color}
                    metalness={0.18}
                    roughness={0.25}
                  />
                </mesh>
                <mesh position={[0, 0.23, 0]}>
                  <cylinderGeometry args={[0.065, 0.065, 0.065, 12]} />
                  <meshStandardMaterial color="#e9f4f2" />
                </mesh>
                <Panel
                  position={[0, -0.04, 0.12]}
                  size={[0.2, 0.14, 0.01]}
                  color="#eef5ed"
                  metalness={0}
                />
              </>
            ) : (
              <>
                <Panel
                  position={[0, 0, 0]}
                  size={[0.29, 0.37, 0.12]}
                  color={color}
                  metalness={0}
                />
                <Panel
                  position={[0, 0.08, 0.07]}
                  size={[0.23, 0.055, 0.01]}
                  color="#f7edcf"
                  metalness={0}
                />
                <mesh position={[0, -0.05, 0.08]}>
                  <circleGeometry args={[0.07, 16]} />
                  <meshBasicMaterial color="#f7edcf" />
                </mesh>
              </>
            )}
            <Text position={[0, -0.28, 0.1]} fontSize={0.08} color="#e1f3f4">
              {item.stock ? `${item.stock} CON` : "HET"}
            </Text>
            <mesh position={[0, 0, 0.15]}>
              <planeGeometry args={[0.7, 0.58]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, -1.62, 0.61]} raycast={() => {}}>
        <planeGeometry args={[1.62, 1.92]} />
        <meshPhysicalMaterial
          color="#bde6ec"
          transparent
          opacity={0.12}
          roughness={0.04}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>
      <Panel
        position={[0, -2.78, 0.31]}
        size={[1.47, 0.26, 0.09]}
        color="#0c2535"
      />
      <Text position={[0, -2.78, 0.37]} fontSize={0.08} color="#b3d6db">
        CUA LAY HANG
      </Text>
    </group>
  );
}
function ScreenFocus({ active }: { active: boolean }) {
  const { camera, controls } = useThree();
  const previous = useRef(active);
  useFrame(() => {
    if (previous.current === active) return;
    previous.current = active;
    camera.position.set(
      active ? 3.55 : 3.2,
      active ? 1.55 : 2.3,
      active ? 4.8 : 9.4,
    );
    const orbit = controls as
      { target?: THREE.Vector3; update?: () => void } | undefined;
    orbit?.target?.set(active ? 3.35 : 0.7, active ? 1.05 : 0, 0);
    orbit?.update?.();
  });
  return null;
}
export default function LockerScene({
  lockers,
  selected,
  onSelect,
  kioskSelected,
  onScreenSelect,
  onBack,
  code,
  screenFeedback,
  onKey,
  onPlace,
  onClose,
  blocked,
  secondsToClose,
  focusScreen,
  onToggleFocus,
  vending,
  onDispense,
  disabled,
}: {
  lockers: LockerStatus[];
  selected: string;
  onSelect: (id: string) => void;
  kioskSelected: string | null;
  onScreenSelect: (id: string) => void;
  onBack: () => void;
  code: string;
  screenFeedback: string;
  onKey: (key: string) => void;
  onPlace: () => void;
  onClose: () => void;
  blocked: number;
  secondsToClose: number;
  focusScreen: boolean;
  onToggleFocus: () => void;
  vending: BankStatus["vending"];
  onDispense: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="scene">
      <Canvas shadows camera={{ position: [3.2, 2.3, 9.4], fov: 42 }}>
        <color attach="background" args={["#dce8ec"]} />
        <ambientLight intensity={1.7} />
        <directionalLight
          castShadow
          position={[4, 7, 6]}
          intensity={2.8}
          shadow-mapSize={[1024, 1024]}
        />
        <Panel
          position={[0, 0, -0.55]}
          size={[4.15, 4.15, 0.2]}
          color="#dae4e8"
        />
        <Panel
          position={[0, 2.12, -0.3]}
          size={[4.28, 0.2, 0.55]}
          color="#173b52"
        />
        <Panel
          position={[0, 1.98, 0.07]}
          size={[4.28, 0.13, 0.15]}
          color="#16a34a"
        />
        <Panel
          position={[0, -2.12, -0.3]}
          size={[4.28, 0.18, 0.55]}
          color="#17425e"
        />
        <SideStation
          lockers={lockers}
          kioskSelected={kioskSelected}
          onScreenSelect={onScreenSelect}
          onBack={onBack}
          selected={selected}
          code={code}
          screenFeedback={screenFeedback}
          onKey={onKey}
          onPlace={onPlace}
          onClose={onClose}
          blocked={blocked}
          secondsToClose={secondsToClose}
          vending={vending}
          onDispense={onDispense}
          disabled={disabled}
        />
        {lockers.map((l) => (
          <Cell
            key={l.id}
            locker={l}
            selected={l.id === selected}
            onSelect={onSelect}
          />
        ))}
        <ContactShadows
          position={[0.7, -2.25, 0]}
          opacity={0.3}
          scale={12}
          blur={2.6}
        />
        <OrbitControls
          makeDefault
          target={[0.7, 0, 0]}
          minDistance={5}
          maxDistance={18}
          minPolarAngle={0.65}
          maxPolarAngle={1.85}
        />
        <ScreenFocus active={focusScreen} />
      </Canvas>
      <button type="button" className="scene-focus" onClick={onToggleFocus}>
        {focusScreen ? "← Toàn cảnh" : "Phóng tới màn hình cảm ứng"}
      </button>
      <div className="scene-caption">
        Kéo để xoay · cuộn để phóng to · bấm vào một ô để điều khiển
      </div>
    </div>
  );
}
