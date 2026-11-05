# FBX / glTF / OBJ -> GLB converter for downloaded packs (Quaternius ships FBX, OBJ and
# embedded-buffer .gltf). Also reports world-space size (Blender Z up) used for scaling.
# Run inside Blender (MCP execute_blender_code):
#   exec(open(r"<repo>/tools/blender/convert_fbx.py").read()); print(convert(JOBS))
# JOBS = [(src_path, dst_glb_path[, target_tris[, drop]]), ...]; target_tris decimates to the budget,
# drop lists mesh object names to delete first. Each file is imported into a temporary scene (the open
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
        o.modifiers.move(len(o.modifiers) - 1, 0)
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=m.name)


def convert_one(src, dst, target_tris=None, drop=()):
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
                'clips': sorted(clip_names), 'bytes': os.path.getsize(dst)}
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
