import fs from "node:fs";
const path = "frontend/public/models/Smart_Locker_V2_OPEN.glb";
if (!fs.existsSync(path)) {
  console.log("GLB unavailable. Procedural hinged-door fallback enabled.");
  process.exit(0);
}
const b = fs.readFileSync(path);
if (b.readUInt32LE(0) !== 0x46546c67) throw Error("Invalid GLB");
const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
console.log(
  JSON.stringify(
    {
      nodes: json.nodes,
      meshes: json.meshes?.map((m) => m.name),
      animations: json.animations?.map((a) => a.name),
    },
    null,
    2,
  ),
);
