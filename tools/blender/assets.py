# TDS asset builders (Blender). Requires tdslib.py in the same namespace.
# Each builder makes one collection with an armature, rigid parts bound to bones, and animation
# clips stored as NLA tracks. Models face -Y in Blender (= +Z in the game).
import math

PAL = {
    'slate': '#2B2D42', 'slate2': '#3A3D5C', 'bone': '#D6CFC7', 'crimson': '#E63946', 'magenta': '#FF3CAC',
    'olive': '#5B6B3A', 'oliveDark': '#47552C', 'khaki': '#C2B280', 'khakiDark': '#A8976A', 'gunmetal': '#3D4451',
    'steel': '#8A939E', 'hazard': '#F28C28', 'skin': '#F1C7A0', 'wood': '#7A5230', 'black': '#1C1E24',
    'violet': '#7B4DFF', 'night': '#1E1B4B', 'teal': '#2EC4B6', 'gold': '#FFD166', 'stone': '#8D8D99',
    'stoneDark': '#6E6E7A', 'ember': '#FF6B35', 'cream': '#EDE6D6', 'muzzle': '#FFD27A',
}


def M(key, emit=0.0, rough=0.85, metal=0.0):
    return material(key + ('_glow' if emit else ''), PAL[key], emit=emit, rough=rough, metal=metal)


# ------------------------------------------------------------------------------------------- Husk
def build_husk():
    coll = collection('husk')
    slate, slate2, bone, eye, crack = M('slate'), M('slate2'), M('bone'), M('crimson', emit=6), M('magenta', emit=3)
    arm = armature(coll, 'husk_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('hips', (0, 0, 0.72), (0, 0, 0.86), 'root'),
        ('spine', (0, 0, 0.86), (0, -0.1, 1.2), 'hips'),
        ('head', (0, -0.12, 1.2), (0, -0.2, 1.5), 'spine'),
        ('arm.L', (0.36, -0.05, 1.12), (0.44, -0.18, 0.5), 'spine'),
        ('arm.R', (-0.36, -0.05, 1.12), (-0.44, -0.18, 0.5), 'spine'),
        ('leg.L', (0.15, 0, 0.74), (0.15, 0, 0.08), 'hips'),
        ('leg.R', (-0.15, 0, 0.74), (-0.15, 0, 0.08), 'hips'),
    ])
    p = Part('husk_hips')
    p.box((0.48, 0.3, 0.2), loc=(0, 0, 0.76), mat=slate2)
    bind(p.build(coll), arm, 'hips')
    p = Part('husk_torso')
    p.box((0.6, 0.42, 0.52), loc=(0, -0.04, 1.0), rot=(math.radians(18), 0, 0), mat=slate)
    for i, z in enumerate((0.9, 1.02, 1.14)):
        p.box((0.46 - i * 0.06, 0.05, 0.05), loc=(0, -0.29 + i * 0.04, z), rot=(math.radians(18), 0, 0), mat=bone)
    p.box((0.06, 0.03, 0.34), loc=(0.12, -0.27, 1.0), rot=(math.radians(18), 0, math.radians(20)), mat=crack)
    for i, (x, z) in enumerate(((0, 1.25), (0.16, 1.12), (-0.16, 1.12))):
        p.cyl(0.07, 0, 0.26 - i * 0.04, 4, loc=(x, 0.18, z), rot=(math.radians(-35), 0, 0), mat=bone)
    bind(p.build(coll), arm, 'spine')
    p = Part('husk_head')
    p.box((0.38, 0.34, 0.3), loc=(0, -0.2, 1.33), mat=slate2)
    p.box((0.3, 0.22, 0.1), loc=(0, -0.26, 1.16), rot=(math.radians(-10), 0, 0), mat=bone)
    for x in (-0.09, 0.09):
        p.box((0.08, 0.04, 0.06), loc=(x, -0.375, 1.36), mat=eye)
        p.cyl(0.05, 0, 0.18, 4, loc=(x * 1.8, -0.16, 1.46), rot=(math.radians(-25), math.radians(x * 200), 0), mat=bone)
    bind(p.build(coll), arm, 'head')
    for side, name in ((1, 'arm.L'), (-1, 'arm.R')):
        p = Part(f'husk_{name}')
        p.box((0.16, 0.17, 0.36), loc=(side * 0.39, -0.1, 0.94), rot=(math.radians(-12), 0, 0), mat=slate)
        p.box((0.14, 0.15, 0.34), loc=(side * 0.42, -0.16, 0.66), rot=(math.radians(-12), 0, 0), mat=slate2)
        for k in (-1, 0, 1):
            p.cyl(0.035, 0, 0.16, 4, loc=(side * 0.42 + k * 0.05, -0.22, 0.5), rot=(math.radians(195), 0, 0), mat=bone)
        bind(p.build(coll), arm, name)
    for side, name in ((1, 'leg.L'), (-1, 'leg.R')):
        p = Part(f'husk_{name}')
        p.box((0.17, 0.19, 0.62), loc=(side * 0.15, 0, 0.42), mat=slate)
        p.box((0.22, 0.32, 0.12), loc=(side * 0.15, -0.06, 0.06), mat=slate2)
        p.box((0.18, 0.04, 0.12), loc=(side * 0.15, -0.1, 0.5), mat=bone)
        bind(p.build(coll), arm, name)

    action(arm, 'Idle', {
        1: {'spine': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}, 'arm.L': {'rot': (0, 0, 0)}, 'arm.R': {'rot': (0, 0, 0)}},
        25: {'spine': {'rot': (6, 0, 0)}, 'head': {'rot': (-6, 6, 0)}, 'arm.L': {'rot': (5, 0, 0)}, 'arm.R': {'rot': (-5, 0, 0)}},
        49: {'spine': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}, 'arm.L': {'rot': (0, 0, 0)}, 'arm.R': {'rot': (0, 0, 0)}},
    })
    action(arm, 'Walk', {
        1: {'leg.L': {'rot': (32, 0, 0)}, 'leg.R': {'rot': (-32, 0, 0)}, 'arm.L': {'rot': (-28, 0, 0)}, 'arm.R': {'rot': (28, 0, 0)}, 'hips': {'loc': (0, 0, 0)}, 'spine': {'rot': (8, 4, 0)}},
        7: {'hips': {'loc': (0, 0.06, 0)}},
        13: {'leg.L': {'rot': (-32, 0, 0)}, 'leg.R': {'rot': (32, 0, 0)}, 'arm.L': {'rot': (28, 0, 0)}, 'arm.R': {'rot': (-28, 0, 0)}, 'hips': {'loc': (0, 0, 0)}, 'spine': {'rot': (8, -4, 0)}},
        19: {'hips': {'loc': (0, 0.06, 0)}},
        25: {'leg.L': {'rot': (32, 0, 0)}, 'leg.R': {'rot': (-32, 0, 0)}, 'arm.L': {'rot': (-28, 0, 0)}, 'arm.R': {'rot': (28, 0, 0)}, 'hips': {'loc': (0, 0, 0)}, 'spine': {'rot': (8, 4, 0)}},
    })
    action(arm, 'Attack', {
        1: {'arm.R': {'rot': (0, 0, 0)}, 'spine': {'rot': (0, 0, 0)}},
        7: {'arm.R': {'rot': (-110, 0, -20)}, 'spine': {'rot': (-10, -15, 0)}},
        11: {'arm.R': {'rot': (40, 0, 10)}, 'spine': {'rot': (22, 15, 0)}},
        20: {'arm.R': {'rot': (0, 0, 0)}, 'spine': {'rot': (0, 0, 0)}},
    })
    action(arm, 'Death', {
        1: {'spine': {'rot': (0, 0, 0)}, 'root': {'loc': (0, 0, 0)}, 'leg.L': {'rot': (0, 0, 0)}, 'leg.R': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}},
        10: {'spine': {'rot': (35, 0, 10)}, 'leg.L': {'rot': (-40, 0, 0)}, 'leg.R': {'rot': (-30, 0, 0)}, 'head': {'rot': (20, 0, 0)}},
        22: {'spine': {'rot': (75, 0, 20)}, 'root': {'loc': (0, 0, -0.45)}, 'leg.L': {'rot': (-80, 0, 0)}, 'leg.R': {'rot': (-70, 0, 0)}, 'head': {'rot': (30, 20, 0)}},
    }, loop=False)
    return coll, arm


# -------------------------------------------------------------------------------------- Gloomwing
def build_gloomwing():
    coll = collection('gloomwing')
    slate, slate2, bone, eye, vein = M('slate'), M('slate2'), M('bone'), M('magenta', emit=6), M('crimson', emit=3)
    arm = armature(coll, 'gloomwing_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('body', (0, 0.3, 0.55), (0, -0.3, 0.55), 'root'),
        ('head', (0, -0.35, 0.6), (0, -0.85, 0.6), 'body'),
        ('wing.L', (0.28, 0, 0.6), (1.35, 0.05, 0.62), 'body'),
        ('wing.R', (-0.28, 0, 0.6), (-1.35, 0.05, 0.62), 'body'),
        ('tail', (0, 0.45, 0.52), (0, 1.35, 0.45), 'body'),
    ])
    p = Part('gloomwing_body')
    p.sphere(0.42, loc=(0, 0, 0.55), scale=(1.0, 1.55, 0.72), mat=slate, u=8, v=6)
    p.box((0.3, 0.6, 0.08), loc=(0, 0.05, 0.31), mat=bone)
    for i, y in enumerate((-0.25, 0.0, 0.25)):
        p.cyl(0.06, 0, 0.24 - i * 0.04, 4, loc=(0, y, 0.82), rot=(math.radians(-20), 0, 0), mat=bone)
    p.box((0.05, 0.5, 0.03), loc=(0.16, 0, 0.78), mat=vein)
    p.box((0.05, 0.5, 0.03), loc=(-0.16, 0, 0.78), mat=vein)
    bind(p.build(coll), arm, 'body')
    p = Part('gloomwing_head')
    p.sphere(0.27, loc=(0, -0.62, 0.62), scale=(1.0, 1.1, 0.85), mat=slate2, u=8, v=6)
    p.box((0.22, 0.2, 0.08), loc=(0, -0.78, 0.5), mat=bone)
    for x in (-0.11, 0.11):
        p.box((0.09, 0.04, 0.05), loc=(x, -0.88, 0.66), rot=(0, 0, math.radians(-x * 150)), mat=eye)
        p.cyl(0.05, 0, 0.26, 4, loc=(x * 1.4, -0.55, 0.78), rot=(math.radians(-60), math.radians(x * 180), 0), mat=bone)
    bind(p.build(coll), arm, 'head')
    for side, name in ((1, 'wing.L'), (-1, 'wing.R')):
        p = Part(f'gloomwing_{name}')
        p.box((1.1, 0.75, 0.04), loc=(side * 0.85, 0.12, 0.6), rot=(0, 0, math.radians(side * 6)), mat=slate2)
        p.box((0.6, 0.5, 0.035), loc=(side * 1.55, 0.25, 0.62), rot=(0, 0, math.radians(side * 22)), mat=slate2)
        p.cyl(0.045, 0.03, 1.3, 5, loc=(side * 0.3, -0.2, 0.62), rot=(0, math.radians(side * 90), math.radians(side * -4)), mat=bone)
        for k in range(3):
            p.cyl(0.03, 0.015, 0.7 - k * 0.1, 4, loc=(side * (0.8 + k * 0.38), -0.18, 0.63), rot=(math.radians(-90), 0, math.radians(side * (10 + k * 14))), mat=bone)
        p.box((0.9, 0.03, 0.03), loc=(side * 0.85, 0.15, 0.625), rot=(0, 0, math.radians(side * 4)), mat=vein)
        bind(p.build(coll), arm, name)
    p = Part('gloomwing_tail')
    p.cyl(0.12, 0.05, 0.85, 6, loc=(0, 0.45, 0.52), rot=(math.radians(-95), 0, 0), mat=slate)
    p.cyl(0.08, 0, 0.3, 4, loc=(0, 1.28, 0.45), rot=(math.radians(-95), 0, 0), mat=vein)
    bind(p.build(coll), arm, 'tail')

    flap = {}
    for f, a, b in ((1, 30, 0), (7, -32, -6), (13, 30, 0)):
        flap[f] = {'wing.L': {'rot': (0, a, 0)}, 'wing.R': {'rot': (0, -a, 0)}, 'body': {'loc': (0, 0, b * 0.01)}, 'tail': {'rot': (b, 0, 0)}}
    action(arm, 'Fly', flap)
    action(arm, 'Idle', {
        1: {'wing.L': {'rot': (0, 20, 0)}, 'wing.R': {'rot': (0, -20, 0)}, 'head': {'rot': (0, 0, 0)}},
        13: {'wing.L': {'rot': (0, -20, 0)}, 'wing.R': {'rot': (0, 20, 0)}, 'head': {'rot': (0, 0, 12)}},
        25: {'wing.L': {'rot': (0, 20, 0)}, 'wing.R': {'rot': (0, -20, 0)}, 'head': {'rot': (0, 0, 0)}},
    })
    action(arm, 'Attack', {
        1: {'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
        6: {'head': {'rot': (-35, 0, 0)}, 'body': {'loc': (0, 0.2, 0)}},
        10: {'head': {'rot': (25, 0, 0)}, 'body': {'loc': (0, -0.25, 0)}},
        18: {'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
    })
    action(arm, 'Death', {
        1: {'root': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'wing.L': {'rot': (0, 0, 0)}, 'wing.R': {'rot': (0, 0, 0)}},
        12: {'root': {'rot': (0, 90, 120), 'loc': (0, 0, -0.4)}, 'wing.L': {'rot': (0, 50, 0)}, 'wing.R': {'rot': (0, -20, 0)}},
        24: {'root': {'rot': (0, 180, 240), 'loc': (0, 0, -0.55)}, 'wing.L': {'rot': (0, 70, 0)}, 'wing.R': {'rot': (0, -70, 0)}},
    }, loop=False)
    return coll, arm


# -------------------------------------------------------------------------------------- Ironshell
def build_ironshell():
    coll = collection('ironshell')
    slate, slate2, steel, bone, eye = M('slate'), M('slate2'), M('steel', rough=0.5, metal=0.6), M('bone'), M('crimson', emit=6)
    arm = armature(coll, 'ironshell_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('body', (0, 0.4, 0.55), (0, -0.4, 0.55), 'root'),
        ('head', (0, -0.7, 0.5), (0, -1.1, 0.5), 'body'),
        ('legs.A', (0, 0, 0.4), (0, 0, 0.1), 'body'),
        ('legs.B', (0, 0.01, 0.4), (0, 0.01, 0.1), 'body'),
    ])
    p = Part('ironshell_body')
    p.box((0.95, 1.3, 0.3), loc=(0, 0, 0.4), mat=slate)
    # segmented dome shell: three overlapping plates, alternating steel / slate
    for i, (y, sy) in enumerate(((-0.45, 0.62), (0.02, 0.7), (0.5, 0.6))):
        p.sphere(0.72, loc=(0, y, 0.55), scale=(1.0 - abs(i - 1) * 0.08, sy / 0.72 * 0.62, 0.62), mat=steel if i != 1 else slate2, u=10, v=5)
        for x in (-0.42, 0, 0.42):
            p.cyl(0.05, 0.02, 0.08, 4, loc=(x, y - 0.1, 0.98 - abs(x) * 0.35), mat=bone)
    p.box((0.08, 1.25, 0.06), loc=(0, 0.02, 0.99), mat=bone)
    for y in (-0.45, 0.02, 0.5):
        p.cyl(0.08, 0, 0.3, 4, loc=(0, y, 0.98), rot=(math.radians(-15), 0, 0), mat=bone)
    bind(p.build(coll), arm, 'body')
    p = Part('ironshell_head')
    p.box((0.62, 0.42, 0.36), loc=(0, -0.82, 0.48), mat=steel)
    p.box((0.5, 0.06, 0.07), loc=(0, -1.04, 0.56), mat=eye)
    for x in (-0.18, 0.18):
        p.cyl(0.07, 0, 0.42, 4, loc=(x, -0.98, 0.38), rot=(math.radians(80), 0, math.radians(x * 120)), mat=bone)
    bind(p.build(coll), arm, 'head')
    for group, legs in (('legs.A', ((1, -0.4), (-1, 0.0), (1, 0.4))), ('legs.B', ((-1, -0.4), (1, 0.0), (-1, 0.4)))):
        p = Part(f'ironshell_{group}')
        for side, y in legs:
            # thigh rises from the body to a raised knee, shin drops to a claw: reads as an insect leg
            p.box((0.62, 0.14, 0.14), loc=(side * 0.68, y, 0.62), rot=(0, math.radians(side * -28), 0), mat=slate2)
            p.box((0.14, 0.14, 0.72), loc=(side * 1.0, y, 0.38), rot=(0, math.radians(side * -14), 0), mat=slate)
            p.cyl(0.07, 0, 0.16, 4, loc=(side * 1.06, y, 0.04), rot=(math.radians(180), 0, 0), mat=bone)
        bind(p.build(coll), arm, group)
    action(arm, 'Walk', {
        1: {'legs.A': {'rot': (0, 0, 14)}, 'legs.B': {'rot': (0, 0, -14)}, 'body': {'loc': (0, 0, 0)}},
        5: {'body': {'loc': (0, 0.04, 0)}},
        9: {'legs.A': {'rot': (0, 0, -14)}, 'legs.B': {'rot': (0, 0, 14)}, 'body': {'loc': (0, 0, 0)}},
        13: {'body': {'loc': (0, 0.04, 0)}},
        17: {'legs.A': {'rot': (0, 0, 14)}, 'legs.B': {'rot': (0, 0, -14)}, 'body': {'loc': (0, 0, 0)}},
    })
    action(arm, 'Idle', {
        1: {'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
        25: {'head': {'rot': (-8, 0, 10)}, 'body': {'loc': (0, 0.03, 0)}},
        49: {'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
    })
    action(arm, 'Attack', {
        1: {'head': {'rot': (0, 0, 0)}, 'body': {'rot': (0, 0, 0)}},
        6: {'head': {'rot': (-25, 0, 0)}, 'body': {'rot': (-8, 0, 0)}},
        10: {'head': {'rot': (20, 0, 0)}, 'body': {'rot': (6, 0, 0)}},
        18: {'head': {'rot': (0, 0, 0)}, 'body': {'rot': (0, 0, 0)}},
    })
    action(arm, 'Death', {
        1: {'root': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'legs.A': {'rot': (0, 0, 0)}, 'legs.B': {'rot': (0, 0, 0)}},
        14: {'root': {'rot': (0, 100, 0), 'loc': (0, 0, 0.5)}, 'legs.A': {'rot': (40, 0, 0)}, 'legs.B': {'rot': (-40, 0, 0)}},
        24: {'root': {'rot': (0, 180, 0), 'loc': (0, 0, 1.15)}, 'legs.A': {'rot': (60, 0, 30)}, 'legs.B': {'rot': (-60, 0, -30)}},
    }, loop=False)
    return coll, arm


# --------------------------------------------------------------------------------------- Rifleman
def build_rifleman():
    coll = collection('rifleman')
    olive, oliveD, khaki, khakiD, gun, skin, wood, black, steel = (M('olive'), M('oliveDark'), M('khaki'), M('khakiDark'),
        M('gunmetal', rough=0.5, metal=0.5), M('skin'), M('wood'), M('black'), M('steel', rough=0.5, metal=0.6))
    arm = armature(coll, 'rifleman_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('body', (0, 0, 0.3), (0, 0, 0.95), 'root'),
        ('torso', (0, 0, 0.95), (0, 0, 1.38), 'body'),
        ('head', (0, 0, 1.38), (0, 0, 1.8), 'torso'),
        ('arms', (0, -0.05, 1.3), (0, -0.6, 1.2), 'torso'),
    ])
    p = Part('rifleman_pad')
    p.cyl(1.05, 1.1, 0.22, 8, loc=(0, 0, -0.08), rot=(0, 0, math.radians(22.5)), mat=gun)
    p.cyl(0.95, 0.95, 0.05, 8, loc=(0, 0, 0.14), rot=(0, 0, math.radians(22.5)), mat=steel)
    for i in range(10):
        a = i / 10 * math.tau
        if abs(math.sin(a) + 1) < 0.25:
            continue  # gap at the front so the rifle reads
        c = khaki if i % 2 else khakiD
        p.box((0.5, 0.28, 0.26), loc=(math.cos(a) * 0.88, math.sin(a) * 0.88, 0.32), rot=(0, 0, a + math.pi / 2), mat=c)
        p.box((0.46, 0.26, 0.22), loc=(math.cos(a + 0.31) * 0.86, math.sin(a + 0.31) * 0.86, 0.55), rot=(0, 0, a + 0.31 + math.pi / 2), mat=khakiD if i % 2 else khaki)
    p.box((0.26, 0.04, 0.12), loc=(0, 0.9, 0.3), mat=M('hazard'))
    bind(p.build(coll), arm, 'root')
    p = Part('rifleman_legs')
    for x in (-0.13, 0.13):
        p.box((0.2, 0.22, 0.5), loc=(x, 0, 0.5), mat=oliveD)
        p.box((0.24, 0.32, 0.16), loc=(x, -0.04, 0.24), mat=black)
    p.box((0.52, 0.3, 0.14), loc=(0, 0, 0.8), mat=oliveD)
    bind(p.build(coll), arm, 'body')
    p = Part('rifleman_torso')
    p.box((0.56, 0.36, 0.5), loc=(0, 0, 1.08), mat=olive)
    p.box((0.46, 0.08, 0.4), loc=(0, -0.2, 1.08), mat=khaki)
    for x in (-0.14, 0.06):
        p.box((0.14, 0.06, 0.12), loc=(x, -0.25, 1.0), mat=khakiD)
    p.box((0.58, 0.38, 0.07), loc=(0, 0, 0.88), mat=black)
    p.box((0.38, 0.22, 0.36), loc=(0, 0.26, 1.08), mat=khakiD)
    bind(p.build(coll), arm, 'torso')
    p = Part('rifleman_head')
    p.box((0.38, 0.36, 0.34), loc=(0, -0.02, 1.52), mat=skin)
    for x in (-0.08, 0.08):
        p.box((0.06, 0.03, 0.08), loc=(x, -0.21, 1.53), mat=black)
    p.sphere(0.27, loc=(0, 0, 1.66), scale=(1.05, 1.08, 0.62), mat=olive, u=8, v=5)
    p.box((0.58, 0.6, 0.05), loc=(0, -0.02, 1.62), mat=oliveD)
    p.box((0.42, 0.04, 0.03), loc=(0, -0.23, 1.47), mat=khakiD)
    bind(p.build(coll), arm, 'head')
    p = Part('rifleman_arms')
    for x, y in ((0.3, -0.12), (-0.26, -0.32)):
        p.box((0.16, 0.42, 0.16), loc=(x, y, 1.24), rot=(math.radians(8), 0, math.radians(-x * 40)), mat=olive)
        p.box((0.15, 0.14, 0.14), loc=(x * 0.55, y - 0.24, 1.2), mat=black)
    p.box((0.09, 0.62, 0.14), loc=(0.02, -0.5, 1.22), mat=gun)
    p.cyl(0.03, 0.03, 0.42, 6, loc=(0.02, -0.8, 1.25), rot=(math.radians(90), 0, 0), mat=gun)
    p.box((0.08, 0.3, 0.12), loc=(0.02, -0.14, 1.18), rot=(math.radians(-10), 0, 0), mat=wood)
    p.box((0.07, 0.1, 0.18), loc=(0.02, -0.46, 1.1), mat=black)
    p.box((0.06, 0.16, 0.06), loc=(0.02, -0.5, 1.33), mat=black)
    bind(p.build(coll), arm, 'arms')
    action(arm, 'Idle', {
        1: {'torso': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
        25: {'torso': {'rot': (2, 0, 0)}, 'head': {'rot': (0, 0, 14)}, 'body': {'loc': (0, -0.012, 0)}},
        49: {'torso': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}, 'body': {'loc': (0, 0, 0)}},
    })
    action(arm, 'Attack', {
        1: {'arms': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'torso': {'rot': (0, 0, 0)}},
        3: {'arms': {'rot': (-8, 0, 0), 'loc': (0, 0.08, 0)}, 'torso': {'rot': (-5, 0, 0)}},
        8: {'arms': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'torso': {'rot': (0, 0, 0)}},
    }, loop=False)
    return coll, arm


# ------------------------------------------------------------------------------------ Ember Adept
def build_ember_adept():
    coll = collection('ember_adept')
    stone, stoneD, violet, night, gold, skin, wood, black = (M('stone'), M('stoneDark'), M('violet'), M('night'), M('gold', rough=0.4, metal=0.4),
        M('skin'), M('wood'), M('black'))
    ember, emberGlow, rune = M('ember'), M('ember', emit=8), M('teal', emit=4)
    arm = armature(coll, 'ember_adept_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('ring', (0, 0, 0.42), (0, 0, 0.62), 'root'),
        ('body', (0, 0, 0.42), (0, 0, 1.3), 'root'),
        ('head', (0, 0, 1.3), (0, 0, 1.75), 'body'),
        ('staff', (0.36, -0.12, 1.05), (0.36, -0.12, 1.6), 'body'),
    ])
    p = Part('ember_adept_plinth')
    p.cyl(0.95, 1.05, 0.28, 6, loc=(0, 0, -0.1), mat=stoneD)
    p.cyl(0.82, 0.88, 0.2, 6, loc=(0, 0, 0.18), rot=(0, 0, math.radians(30)), mat=stone)
    for i in range(6):
        a = i / 6 * math.tau + math.radians(30)
        p.box((0.16, 0.04, 0.06), loc=(math.cos(a) * 0.83, math.sin(a) * 0.83, 0.3), rot=(0, 0, a + math.pi / 2), mat=rune)
    bind(p.build(coll), arm, 'root')
    p = Part('ember_adept_ring')
    p.torus(1.0, 0.025, seg=24, rseg=4, loc=(0, 0, 0.62), mat=rune)
    for i in range(4):
        a = i / 4 * math.tau
        p.box((0.1, 0.03, 0.14), loc=(math.cos(a), math.sin(a), 0.62), rot=(0, 0, a), mat=rune)
    bind(p.build(coll), arm, 'ring')
    p = Part('ember_adept_body')
    p.cyl(0.46, 0.2, 0.95, 8, loc=(0, 0, 0.38), mat=violet)
    p.cyl(0.47, 0.47, 0.08, 8, loc=(0, 0, 0.38), mat=gold)
    p.box((0.08, 0.05, 0.75), loc=(0, -0.3, 0.75), rot=(math.radians(-15), 0, 0), mat=ember)
    p.box((0.5, 0.3, 0.12), loc=(0, 0, 1.2), mat=night)
    for x in (-0.3, 0.3):
        p.sphere(0.13, loc=(x, 0, 1.2), mat=violet, u=6, v=4)
    p.box((0.13, 0.15, 0.36), loc=(-0.32, -0.08, 1.0), rot=(math.radians(-20), 0, math.radians(10)), mat=violet)
    p.box((0.13, 0.12, 0.12), loc=(-0.3, -0.18, 0.85), mat=skin)
    p.cyl(0.24, 0.05, 0.32, 6, loc=(0, 0.2, 0.95), rot=(math.radians(-170), 0, 0), mat=night)
    bind(p.build(coll), arm, 'body')
    p = Part('ember_adept_head')
    p.box((0.34, 0.32, 0.32), loc=(0, -0.02, 1.44), mat=skin)
    for x in (-0.07, 0.07):
        p.box((0.06, 0.03, 0.07), loc=(x, -0.19, 1.45), mat=black)
    p.cyl(0.38, 0.38, 0.05, 8, loc=(0, 0, 1.58), mat=night)
    p.cyl(0.22, 0.12, 0.34, 8, loc=(0, 0.02, 1.6), mat=violet)
    p.cyl(0.12, 0.0, 0.36, 6, loc=(0, 0.06, 1.92), rot=(math.radians(-25), 0, 0), mat=violet)
    p.cyl(0.23, 0.23, 0.06, 8, loc=(0, 0.02, 1.62), mat=gold)
    p.box((0.06, 0.03, 0.06), loc=(0, -0.21, 1.66), mat=emberGlow)
    bind(p.build(coll), arm, 'head')
    p = Part('ember_adept_staff')
    p.cyl(0.035, 0.035, 1.55, 6, loc=(0.36, -0.12, 0.42), mat=wood)
    p.box((0.13, 0.13, 0.12), loc=(0.36, -0.12, 1.08), mat=skin)
    p.torus(0.11, 0.025, seg=10, rseg=4, loc=(0.36, -0.12, 2.02), rot=(math.radians(90), 0, 0), mat=gold)
    p.ico(0.09, loc=(0.36, -0.12, 2.02), mat=emberGlow, sub=1)
    for k in range(3):
        a = k / 3 * math.tau
        p.cyl(0.02, 0.0, 0.16, 4, loc=(0.36 + math.cos(a) * 0.1, -0.12 + math.sin(a) * 0.1, 1.93), rot=(math.cos(a) * 0.4, math.sin(a) * -0.4, 0), mat=gold)
    bind(p.build(coll), arm, 'staff')
    ring = {}
    for f, deg in ((1, 0), (25, 180), (49, 360)):
        ring[f] = {'ring': {'rot': (0, deg, 0)}, 'body': {'loc': (0, 0.03 if f == 25 else 0, 0)}, 'staff': {'rot': (0, 0, 4 if f == 25 else 0)}}
    action(arm, 'Idle', ring)
    action(arm, 'Attack', {
        1: {'staff': {'rot': (0, 0, 0)}, 'body': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}},
        6: {'staff': {'rot': (35, 0, 0)}, 'body': {'rot': (-6, 0, 0)}, 'head': {'rot': (-8, 0, 0)}},
        10: {'staff': {'rot': (-45, 0, 0)}, 'body': {'rot': (8, 0, 0)}, 'head': {'rot': (6, 0, 0)}},
        20: {'staff': {'rot': (0, 0, 0)}, 'body': {'rot': (0, 0, 0)}, 'head': {'rot': (0, 0, 0)}},
    }, loop=False)
    return coll, arm


# --------------------------------------------------------------------------------- Rocket Battery
def build_rocket_battery():
    coll = collection('rocket_battery')
    olive, oliveD, gun, steel, hazard, black, khaki = (M('olive'), M('oliveDark'), M('gunmetal', rough=0.5, metal=0.5),
        M('steel', rough=0.45, metal=0.6), M('hazard'), M('black'), M('khaki'))
    red = M('crimson', emit=3)
    arm = armature(coll, 'rocket_battery_rig', [
        ('root', (0, 0, 0), (0, 0, 0.3), None),
        ('turret', (0, 0, 0.3), (0, 0, 0.8), 'root'),
        ('pod', (0, 0, 0.95), (0, -0.6, 0.95), 'turret'),
        ('radar', (0, 0.62, 1.5), (0, 0.62, 1.8), 'turret'),
    ])
    p = Part('rocket_battery_base')
    p.box((2.3, 2.3, 0.3), loc=(0, 0, 0.0), mat=gun)
    p.box((2.1, 2.1, 0.06), loc=(0, 0, 0.17), mat=steel)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(3):
                p.box((0.1, 0.42, 0.02), loc=(sx * (0.92 - k * 0.12), sy * 0.92, 0.21), rot=(0, 0, math.radians(45 * sx * sy)), mat=hazard if k % 2 == 0 else black)
            p.box((0.3, 0.3, 0.3), loc=(sx * 1.0, sy * 1.0, 0.25), mat=oliveD)
    bind(p.build(coll), arm, 'root')
    p = Part('rocket_battery_turret')
    p.cyl(0.72, 0.8, 0.42, 10, loc=(0, 0, 0.2), mat=olive)
    p.cyl(0.6, 0.6, 0.08, 10, loc=(0, 0, 0.62), mat=steel)
    for sx in (-0.55, 0.55):
        p.box((0.16, 0.5, 0.55), loc=(sx, 0, 0.85), mat=oliveD)
    p.cyl(0.04, 0.04, 0.6, 5, loc=(0, 0.62, 0.7), mat=gun)
    bind(p.build(coll), arm, 'turret')
    p = Part('rocket_battery_pod')
    p.box((1.0, 1.1, 0.78), loc=(0, -0.05, 1.05), mat=olive)
    p.box((1.06, 0.06, 0.84), loc=(0, -0.62, 1.05), mat=oliveD)
    for ix in (-1, 0, 1):
        for iz in (0, 1):
            x, z = ix * 0.3, 0.88 + iz * 0.34
            p.cyl(0.12, 0.12, 0.08, 8, loc=(x, -0.62, z), rot=(math.radians(90), 0, 0), mat=hazard)
            p.cyl(0.085, 0.085, 0.09, 8, loc=(x, -0.63, z), rot=(math.radians(90), 0, 0), mat=black)
            p.cyl(0.05, 0.0, 0.08, 6, loc=(x, -0.6, z), rot=(math.radians(90), 0, 0), mat=red)
    for sx in (-0.53, 0.53):
        p.box((0.06, 0.9, 0.5), loc=(sx, -0.05, 1.05), mat=oliveD)
        p.box((0.07, 0.3, 0.06), loc=(sx * 1.02, -0.3, 1.2), mat=khaki)
    p.box((0.7, 0.8, 0.06), loc=(0, -0.05, 1.47), mat=oliveD)
    p.cyl(0.02, 0.01, 0.45, 4, loc=(0.35, 0.35, 1.47), mat=gun)
    bind(p.build(coll), arm, 'pod')
    p = Part('rocket_battery_radar')
    p.cyl(0.05, 0.05, 0.25, 6, loc=(0, 0.62, 1.3), mat=gun)
    p.cyl(0.28, 0.08, 0.1, 8, loc=(0, 0.62, 1.55), rot=(math.radians(-70), 0, 0), mat=steel)
    p.box((0.03, 0.03, 0.03), loc=(0, 0.56, 1.6), mat=red)
    bind(p.build(coll), arm, 'radar')
    action(arm, 'Idle', {
        1: {'radar': {'rot': (0, 0, 0)}, 'pod': {'rot': (0, 0, 0)}},
        25: {'radar': {'rot': (0, 180, 0)}, 'pod': {'rot': (3, 0, 0)}},
        49: {'radar': {'rot': (0, 360, 0)}, 'pod': {'rot': (0, 0, 0)}},
    })
    action(arm, 'Attack', {
        1: {'pod': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'turret': {'rot': (0, 0, 0)}},
        3: {'pod': {'rot': (-12, 0, 0), 'loc': (0, -0.12, 0)}, 'turret': {'rot': (0, 2, 0)}},
        12: {'pod': {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 'turret': {'rot': (0, 0, 0)}},
    }, loop=False)
    return coll, arm


BUILDERS = {
    'husk': build_husk, 'gloomwing': build_gloomwing, 'ironshell': build_ironshell,
    'rifleman': build_rifleman, 'ember_adept': build_ember_adept, 'rocket_battery': build_rocket_battery,
}
