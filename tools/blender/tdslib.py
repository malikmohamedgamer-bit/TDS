# TDS Blender helper library. Run inside Blender (Blender MCP or the Scripting tab):
#   exec(open(r"<repo>/tools/blender/tdslib.py").read(), ns)
# Conventions (docs/art-style.md): metres, Z up, models face -Y (exported glTF faces +Z),
# origin at ground centre, flat-shaded low poly, palette materials, glow = emission.
import math
import bpy
import bmesh
from mathutils import Matrix, Vector, Euler


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def material(name, color, emit=0.0, rough=0.85, metal=0.0):
    """Palette material. emit > 0 makes it glow (bloom in game)."""
    key = f"TDS_{name}"
    m = bpy.data.materials.get(key)
    if m is None:
        m = bpy.data.materials.new(key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgba = hex_rgba(color)
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit > 0:
        bsdf.inputs['Emission Color'].default_value = rgba
        bsdf.inputs['Emission Strength'].default_value = emit
    else:
        bsdf.inputs['Emission Strength'].default_value = 0.0
    m.diffuse_color = rgba
    return m


def collection(name, clear=True):
    """Fresh collection for one asset (removes its old objects)."""
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    elif clear:
        for ob in list(coll.objects):
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if data is not None and getattr(data, 'users', 1) == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
    # must be visible: Blender does not evaluate world matrices of hidden objects, and bind()
    # relies on them (a hidden rebuild produced zero-scale parts)
    coll.hide_viewport = False
    coll.hide_render = False
    lc = next((c for c in bpy.context.view_layer.layer_collection.children if c.collection is coll), None)
    if lc is not None:
        lc.exclude = False
        lc.hide_viewport = False
    return coll


def _xform(bm, scale=(1, 1, 1), rot=(0, 0, 0), loc=(0, 0, 0)):
    m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


class Part:
    """Accumulates primitives (each with its own material) into one bmesh, then one object."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def _merge(self, tmp, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        idx = self.mats.index(mat)
        for f in tmp.faces:
            f.material_index = idx
            f.smooth = False
        me = bpy.data.meshes.new('_tmp')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def _new(self):
        bm = bmesh.new()
        bm.loops.layers.uv.new('UVMap')
        return bm

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None):
        bm = self._new()
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        _xform(bm, size, rot, loc)
        return self._merge(bm, mat)

    def cyl(self, r1, r2, h, seg, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, scale=(1, 1, 1)):
        """Cylinder / cone standing on loc (base centre), axis +Z before rotation."""
        bm = self._new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=max(r2, 0.0001) if r2 > 0 else 0, depth=h, calc_uvs=True)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
        _xform(bm, scale, rot, loc)
        return self._merge(bm, mat)

    def ico(self, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, scale=(1, 1, 1), sub=1):
        bm = self._new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, calc_uvs=True)
        _xform(bm, scale, rot, loc)
        return self._merge(bm, mat)

    def sphere(self, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, scale=(1, 1, 1), u=8, v=6):
        bm = self._new()
        bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r, calc_uvs=True)
        _xform(bm, scale, rot, loc)
        return self._merge(bm, mat)

    def torus(self, R, r, seg=16, rseg=6, loc=(0, 0, 0), rot=(0, 0, 0), mat=None):
        bm = self._new()
        verts = []
        for i in range(seg):
            a = i / seg * math.tau
            ring = []
            for j in range(rseg):
                b = j / rseg * math.tau
                x = (R + r * math.cos(b)) * math.cos(a)
                y = (R + r * math.cos(b)) * math.sin(a)
                z = r * math.sin(b)
                ring.append(bm.verts.new((x, y, z)))
            verts.append(ring)
        for i in range(seg):
            for j in range(rseg):
                a, b = verts[i][j], verts[(i + 1) % seg][j]
                c, d = verts[(i + 1) % seg][(j + 1) % rseg], verts[i][(j + 1) % rseg]
                bm.faces.new((a, b, c, d))
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                lp[uvl].uv = (lp.vert.co.x, lp.vert.co.z)
        _xform(bm, (1, 1, 1), rot, loc)
        return self._merge(bm, mat)

    def wedge(self, w, d, h, loc=(0, 0, 0), rot=(0, 0, 0), mat=None):
        """Triangular prism: base w (x) by d (y), apex ridge along y at height h."""
        bm = self._new()
        pts = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2, h), (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2, h)]
        v = [bm.verts.new(p) for p in pts]
        for f in ((0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)):
            bm.faces.new([v[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                lp[uvl].uv = (lp.vert.co.x + lp.vert.co.y, lp.vert.co.z)
        _xform(bm, (1, 1, 1), rot, loc)
        return self._merge(bm, mat)

    def build(self, coll, parent=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.0001)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        return ob


def armature(coll, name, bones):
    """bones: list of (name, head, tail, parent_name or None). Returns the armature object."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    coll.objects.link(ob)
    view = bpy.context.view_layer
    for o in view.objects:
        o.select_set(False)
    view.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for bname, head, tail, parent in bones:
        b = eb.new(bname)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ob


def bind(obj, arm_ob, bone):
    """Rigid-bind a part to a bone, keeping its current world placement."""
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = arm_ob
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world


def action(arm_ob, name, keys, fps=24, loop=True):
    """keys: {frame: {bone: {'rot': (x,y,z) degrees, 'loc': (x,y,z)}}}. Creates an action and
    stashes it in an NLA track so the glTF exporter writes it as its own animation clip."""
    ad = arm_ob.animation_data or arm_ob.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    for pb in arm_ob.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    touched = set()
    for frame in sorted(keys):
        for bname, tr in keys[frame].items():
            pb = arm_ob.pose.bones[bname]
            if 'rot' in tr:
                pb.rotation_euler = tuple(math.radians(a) for a in tr['rot'])
                pb.keyframe_insert('rotation_euler', frame=frame)
            if 'loc' in tr:
                pb.location = tr['loc']
                pb.keyframe_insert('location', frame=frame)
            touched.add(bname)
    try:
        fcurves = act.fcurves
    except AttributeError:
        fcurves = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    fcurves.extend(bag.fcurves)
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
        if loop:
            try:
                fc.modifiers.new('CYCLES')
            except Exception:
                pass
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(min(keys)), act)
    strip.name = name
    ad.action = None
    for pb in arm_ob.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def stats(coll):
    tris = 0
    for ob in coll.all_objects:
        if ob.type == 'MESH':
            me = ob.data
            tris += sum(len(p.vertices) - 2 for p in me.polygons)
    return {'objects': len(coll.all_objects), 'triangles': tris}


def export_glb(coll, path):
    # hidden objects cannot be selected, and an empty selection exports an empty file
    coll.hide_viewport = False
    coll.hide_render = False
    view = bpy.context.view_layer
    lc = next((c for c in view.layer_collection.children if c.collection is coll), None)
    if lc is not None:
        lc.exclude = False
        lc.hide_viewport = False
    for o in view.objects:
        o.select_set(False)
    for ob in coll.all_objects:
        ob.select_set(True)
    arm = next((o for o in coll.all_objects if o.type == 'ARMATURE'), None)
    view.objects.active = arm or next(iter(coll.all_objects))
    kwargs = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                  export_apply=False, export_animations=True, export_materials='EXPORT')
    bpy.context.view_layer.update()
    for ob in coll.all_objects:
        if ob.type == 'MESH' and min(abs(v) for v in ob.matrix_world.to_scale()) < 1e-4:
            raise RuntimeError(f'export {coll.name}: {ob.name} has zero scale (built while hidden?)')
    selected = [o for o in coll.all_objects if o.select_get()]
    if len(selected) != len(coll.all_objects):
        raise RuntimeError(f'export {coll.name}: only {len(selected)}/{len(coll.all_objects)} objects selectable')
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_animation_mode='NLA_TRACKS')
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    return path


def isolate(coll):
    """Hide every other asset collection (one asset per saved .blend view)."""
    for c in bpy.context.scene.collection.children:
        c.hide_viewport = c is not coll
        c.hide_render = c is not coll
