// node tools/glb-info.mjs <file.glb...>: prints nodes, meshes, materials, animations and triangle counts.
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + len).toString('utf8'));
  let tris = 0;
  for (const m of json.meshes || []) for (const p of m.primitives) {
    const acc = json.accessors[p.indices ?? p.attributes.POSITION];
    tris += p.indices !== undefined ? acc.count / 3 : acc.count / 3;
  }
  const anims = (json.animations || []).map((a) => {
    const times = a.samplers.map((s) => json.accessors[s.input].max?.[0] ?? 0);
    return `${a.name} (${Math.max(...times).toFixed(2)}s, ${a.channels.length} ch)`;
  });
  console.log(`${f}: ${buf.length} bytes | nodes ${json.nodes.length} | meshes ${(json.meshes || []).length} | skins ${(json.skins || []).length} | materials ${(json.materials || []).map((m) => m.name).join(',')} | tris ${tris} | anims ${anims.join('; ')}`);
}
