"use client";
// ═══════════════════════════════════════════════════════════
// SinglePaneGridWindow — Brown casing, white sash, and a 2×4 grid
// Used by "Single Pane White w/ Grid" feature options. All geometry is
// derived from the configured opening width (ow) and height (oh), so the
// database's W x H dimensions control both the frame and eight glass panes.
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

const FRAME_COLOR = "#a76c1a";
const SASH_COLOR = "#fffafa";
const GLASS_COLOR = "#a8a4a4";

export default function SinglePaneGridWindow({ ow, oh }) {
  const sashT = Math.min(ow, oh) * 0.04;
  const mullionT = Math.min(ow, oh) * 0.025;
  const innerW = ow - sashT * 2;
  const innerH = oh - sashT * 2;
  const paneW = (innerW - mullionT) / 2;
  const paneH = (innerH - mullionT * 3) / 4;
  const glassZ = 0.025;
  const sashZ = 0.04;

  return (
    <group>
      {/* Eight individual glass sections: two columns and four rows. */}
      {[0, 1, 2, 3].flatMap((row) => (
        [0, 1].map((column) => {
          const x = (column === 0 ? -1 : 1) * (mullionT / 2 + paneW / 2);
          const y = innerH / 2 - paneH / 2 - row * (paneH + mullionT);
          return (
            <mesh key={`glass-${row}-${column}`} position={[x, y, glassZ]}>
              <boxGeometry args={[paneW, paneH, 0.015]} />
              <meshStandardMaterial color={GLASS_COLOR} roughness={0.24} metalness={0.4} />
            </mesh>
          );
        })
      ))}

      {/* White inner sash around the glass opening. */}
      {[-1, 1].map((side) => (
        <mesh key={`sash-side-${side}`} position={[side * (ow / 2 - sashT / 2), 0, sashZ]}>
          <boxGeometry args={[sashT, oh, 0.02]} />
          <meshStandardMaterial color={SASH_COLOR} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`sash-horizontal-${side}`} position={[0, side * (oh / 2 - sashT / 2), sashZ]}>
          <boxGeometry args={[ow - sashT * 2, sashT, 0.02]} />
          <meshStandardMaterial color={SASH_COLOR} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}

      {/* One vertical and three horizontal white grid bars. */}
      <mesh position={[0, 0, sashZ]}>
        <boxGeometry args={[mullionT, innerH, 0.02]} />
        <meshStandardMaterial color={SASH_COLOR} roughness={0.35} metalness={0.25} />
      </mesh>
      {[-1, 0, 1].map((row) => (
        <mesh key={`mullion-${row}`} position={[0, row * (paneH + mullionT), sashZ]}>
          <boxGeometry args={[innerW, mullionT, 0.02]} />
          <meshStandardMaterial color={SASH_COLOR} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}

      {/* Brown outer casing matches the reference door/window trim. */}
      <FrameShell ow={ow} oh={oh} color={FRAME_COLOR} />
    </group>
  );
}