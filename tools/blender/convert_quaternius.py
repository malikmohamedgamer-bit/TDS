# Converts every model listed in tools/quaternius-models.json from the raw packs
# (assets/packs/quaternius-<pack>/, see docs/credits.md) into assets/models/quaternius/<pack>/<file>.glb
# and writes assets/packs/quaternius-convert.json (sizes, triangles, clips, glow faces) for
# tools/import-quaternius.mjs. Run inside Blender (MCP execute_blender_code):
#   exec(open(r"<repo>/tools/blender/convert_quaternius.py").read()); print(run(r"<repo>"))
# Optional: run(repo, only=["tank3"]) converts a subset.
import io
import contextlib
import json
import os


def run(repo, only=None):
    ns = {}
    exec(open(os.path.join(repo, 'tools/blender/convert_fbx.py')).read(), ns)
    cfg = json.load(open(os.path.join(repo, 'tools/quaternius-models.json')))
    jobs, keys = [], []
    for m in cfg['models']:
        if only and m['file'] not in only:
            continue
        src = os.path.join(repo, 'assets/packs', 'quaternius-' + m['pack'], m['src'])
        dst = os.path.join(repo, 'assets/models/quaternius', m['pack'], m['file'] + '.glb')
        drop = [w for w in cfg['weapons'] if w != m['keepWeapon']] if m.get('keepWeapon') else ()
        glow = m.get('glow')
        if isinstance(glow, str):
            glow = cfg['glowSpecs'][glow]
        jobs.append((src, dst, m['tris'], drop, glow))
        keys.append(m['pack'] + '/' + m['file'] + '.glb')
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):  # the glTF exporter is chatty
        res = ns['convert'](jobs)
    info_path = os.path.join(repo, 'assets/packs/quaternius-convert.json')
    info = json.load(open(info_path)) if os.path.exists(info_path) else {}
    lines = []
    for k, r in zip(keys, res):
        if 'error' in r:
            lines.append(f'{k}: ERROR {r["error"]}')
            continue
        info[k] = r
        lines.append(f'{k}: {r["tris"]} tris, glow faces {r.get("glow_faces", 0)}, clips {len(r["clips"])}')
    json.dump(info, open(info_path, 'w'), indent=1)
    return '\n'.join(lines)
