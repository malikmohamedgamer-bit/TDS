# FBX / glTF / OBJ -> GLB converter for downloaded packs (Quaternius ships FBX, OBJ and
# embedded-buffer .gltf). Also reports world-space size (Blender Z up) used for scaling.
# Run inside Blender (MCP execute_blender_code):
#   exec(open(r"<repo>/tools/blender/convert_fbx.py").read()); print(convert(JOBS))
# JOBS = [(src_path, dst_glb_path[, target_tris[, drop]]), ...]; target_tris decimates to the budget,
# drop lists mesh object names to delete first, glow is a mark_glow spec (eyes, accents). Each file is imported into a temporary scene (the open
# .blend is not touched), exported with all its actions as separate clips, then the scene and
# every datablock it created are removed. Returns one summary dict per file.
import bpy
import os
import re


def _new_ids():
    return {k: set(getattr(bpy.data, k)) for k in
            ('objects', 'meshes', 'materials', 'armatures', 'actions', 'images', 'collections')}


def _cleanup(before):
    for k, old in before.items():
        coll = getattr(bpy.data, k)
        for d in [d for d in coll if d not in old]:
            try:
                coll.remove(d)
            except Exception:
                pass


def _srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def _hex_lin(h):
    h = h.lstrip('#')
    return [(lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]


def mark_glow(meshes, spec):
    """Give small face islands an emissive material ("eyes always glow", docs/art-style.md).
    spec: {'groups': name prefix of the bones to search ('Head'; '' = whole mesh), 'dark': sRGB
    luminance limit for candidate faces (atlas texel or material colour), or 'colors': sRGB hex
    list (within 0.03), or 'materials': names
    (prefix match) of candidate materials, 'max_share': largest island as a share of the mesh area,
    'color': glow hex, 'strength'}. Marked vertices go in group 'tds_protect' so decimation keeps
    them. Returns the number of faces marked."""
    import bmesh
    col = _hex_lin(spec.get('color', '#E63946'))
    mat = bpy.data.materials.new('TDS_Glow')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Strength'].default_value = spec.get('strength', 2.0)
    marked = 0
    # island sizes are compared with the whole model (eyes are often a separate small mesh)
    total_area = sum(sum(p.area for p in o.data.polygons) for o in meshes) or 1
    want = [[int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)] for h in spec.get('colors', [])]
    for o in meshes:
        me = o.data
        groups = [g.index for g in o.vertex_groups if g.name.startswith(spec.get('groups', 'Head'))] if spec.get('groups', 'Head') else None
        if groups is not None and not groups:
            continue
        # per-material colour source: atlas pixels or base colour
        srcs = []
        for m in me.materials:
            img = None
            if m and m.use_nodes:
                t = next((n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
                img = t.image if t else None
            if img:
                srcs.append(('img', img.size[0], img.size[1], list(img.pixels)))
            else:
                b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.use_nodes else None
                c = b.inputs['Base Color'].default_value if b else (1, 1, 1, 1)
                srcs.append(('col', [_srgb(c[0]), _srgb(c[1]), _srgb(c[2])]))
        bm = bmesh.new()
        bm.from_mesh(me)
        uv = bm.loops.layers.uv.active
        dl = bm.verts.layers.deform.active
        names = spec.get('materials')
        cand = set()
        for f in bm.faces:
            if groups is not None:
                w = {}
                for v in f.verts:
                    for gi, wt in (v[dl].items() if dl else []):
                        w[gi] = w.get(gi, 0) + wt
                if not w or max(w, key=w.get) not in groups:
                    continue
            mi = f.material_index
            if mi >= len(srcs):
                continue
            if names:
                if me.materials[mi] and any(me.materials[mi].name.startswith(n) for n in names):
                    cand.add(f)
                continue
            s = srcs[mi]
            if s[0] == 'img' and uv:
                u = sum(l[uv].uv[0] for l in f.loops) / len(f.loops)
                v = sum(l[uv].uv[1] for l in f.loops) / len(f.loops)
                x = min(s[1] - 1, max(0, int((u % 1) * s[1])))
                y = min(s[2] - 1, max(0, int((v % 1) * s[2])))
                i = (y * s[1] + x) * 4
                rgb = s[3][i:i + 3]
            else:
                rgb = s[1] if s[0] == 'col' else (1, 1, 1)
            if want:
                if any(max(abs(rgb[i] - w[i]) for i in range(3)) < 0.03 for w in want):
                    cand.add(f)
            elif 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < spec.get('dark', 0.2):
                cand.add(f)
        # islands of candidate faces sharing an edge; keep the small ones
        keep = []
        seen = set()
        for f in cand:
            if f in seen:
                continue
            isl, stack = [], [f]
            seen.add(f)
            while stack:
                g = stack.pop()
                isl.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h in cand and h not in seen:
                            seen.add(h)
                            stack.append(h)
            if sum(g.calc_area() for g in isl) < spec.get('max_share', 0.02) * total_area:
                keep += isl
        if keep:
            me.materials.append(mat)
            slot = len(me.materials) - 1
            for f in keep:
                f.material_index = slot
            bm.to_mesh(me)
            vg = o.vertex_groups.get('tds_protect') or o.vertex_groups.new(name='tds_protect')
            vg.add(sorted({v.index for f in keep for v in f.verts}), 1.0, 'REPLACE')
            marked += len(keep)
        bm.free()
    return marked


def _decimate(meshes, target_tris):
    """Collapse-decimate all meshes by one ratio so their total is about target_tris. Runs first in
    the modifier stack (before the armature), so skin weights are interpolated and kept."""
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    if total <= target_tris:
        return
    ratio = target_tris / total
    for o in meshes:
        if o.data.shape_keys:
            o.shape_key_clear()  # shape keys block applying; the game does not use them
        m = o.modifiers.new('tds_decimate', 'DECIMATE')
        m.ratio = ratio
        m.use_collapse_triangulate = True
        if o.vertex_groups.get('tds_protect'):
            m.vertex_group = 'tds_protect'  # glowing eyes are tiny: never collapse them
            m.invert_vertex_group = True
        o.modifiers.move(len(o.modifiers) - 1, 0)
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=m.name)


def convert_one(src, dst, target_tris=None, drop=(), glow=None):
    before = _new_ids()
    win = bpy.context.window
    prev_scene = win.scene
    scene = bpy.data.scenes.new('tds_convert_tmp')
    win.scene = scene
    try:
        ext = os.path.splitext(src)[1].lower()
        if ext == '.fbx':
            bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)
        elif ext in ('.gltf', '.glb'):
            bpy.ops.import_scene.gltf(filepath=src)
        elif ext == '.obj':
            bpy.ops.wm.obj_import(filepath=src)
        else:
            raise ValueError(f'unsupported {src}')
        for o in [o for o in scene.objects if o.type == 'MESH' and o.name.split('.')[0] in drop]:
            bpy.data.objects.remove(o)  # e.g. the 13 spare weapons a Toon Shooter character carries
        objs = list(scene.objects)
        arm = next((o for o in objs if o.type == 'ARMATURE'), None)
        actions = [a for a in bpy.data.actions if a not in before['actions']]
        # one NLA track per action so the exporter writes every clip, names cleaned of "Armature|"
        clip_names = []
        if arm and actions:
            arm.animation_data_create()
            arm.animation_data.action = None
            for tr in list(arm.animation_data.nla_tracks):  # the glTF importer stashes its own
                arm.animation_data.nla_tracks.remove(tr)
            for o in objs:  # shape-key / object actions are not used by the game
                if o is not arm and o.animation_data:
                    o.animation_data_clear()
            for a in actions:
                # the exporter names each clip after its track; strip "Armature|" and Blender's
                # ".001" suffixes (added when the open .blend already has an action of that name)
                clean = re.sub(r'\.\d{3}$', '', a.name.split('|')[-1])
                tr = arm.animation_data.nla_tracks.new()
                tr.name = clean
                tr.strips.new(clean, int(a.frame_range[0]), a)
                clip_names.append(clean)
        glow_faces = mark_glow([o for o in objs if o.type == 'MESH'], glow) if glow else 0
        if target_tris:
            _decimate([o for o in objs if o.type == 'MESH'], target_tris)
        if arm:
            arm.data.pose_position = 'REST'  # measure the rest pose, not a blend of all tracks
        bpy.context.view_layer.update()
        tris = 0
        dg = bpy.context.evaluated_depsgraph_get()
        lo, hi = [1e9] * 3, [-1e9] * 3
        for o in objs:
            if o.type != 'MESH':
                continue
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            for v in me.vertices:
                w = o.matrix_world @ v.co
                for i in range(3):
                    lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
            o.evaluated_get(dg).to_mesh_clear()
        if arm:
            arm.data.pose_position = 'POSE'
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        kw = dict(filepath=dst, export_format='GLB', use_active_scene=True, export_apply=False,
                  export_yup=True, export_animations=bool(actions), export_texcoords=True,
                  export_normals=True, export_materials='EXPORT')
        if actions:
            kw['export_animation_mode'] = 'NLA_TRACKS'
        bpy.ops.export_scene.gltf(**kw)
        return {'src': os.path.basename(src), 'dst': dst, 'tris': tris,
                'size_zup': [round(hi[i] - lo[i], 3) for i in range(3)],
                'clips': sorted(clip_names), 'glow_faces': glow_faces, 'bytes': os.path.getsize(dst)}
    finally:
        win.scene = prev_scene
        bpy.data.scenes.remove(scene)
        _cleanup(before)


def convert(jobs):
    out = []
    for job in jobs:
        src = job[0]
        try:
            out.append(convert_one(*job))
        except Exception as e:  # report and continue with the rest
            out.append({'src': src, 'error': str(e)})
    return out
