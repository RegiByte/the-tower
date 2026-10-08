"""
Shared modeling kit for the tower's furniture and workers, run inside Blender (`npm run tower3d:models`).

Models are authored in the renderer's coordinates: y up, +z forward, meters. `at` converts to Blender's z-up,
and the glTF exporter converts back, so a number here is the number the renderer sees.

The renderer reads two things from a model by name (src/models.ts):
- a pivot's name (an empty), for the parts it moves (`body`, `arm_L`, ...); meshes are merged per pivot and material;
- a material's name and color: `glow*` is unlit, `skin` is recolored per worker, anything else is toon-shaded
  in its base color.
"""
import math
import sys

import bpy
from mathutils import Vector


def at(x, y, z):
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


_materials = {}


def mat(name, color):
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    rgb = tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    srgb_to_linear = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*map(srgb_to_linear, rgb), 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
    if name.startswith("glow"):
        m.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (*map(srgb_to_linear, rgb), 1)
        m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 2
    _materials[name] = m
    return m


def _finish(obj, name, material, parent, bevel=0.0, segments=3, smooth=False, subdivide=0):
    obj.name = name
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    if subdivide:
        mod = obj.modifiers.new("subsurf", "SUBSURF")
        mod.levels = mod.render_levels = subdivide
    if smooth or bevel or subdivide:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        if bevel and not subdivide:
            obj.modifiers.new("normals", "WEIGHTED_NORMAL").keep_sharp = True
    if parent:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def box(name, size, center, material, parent=None, bevel=0.0, segments=3, subdivide=0):
    """A box `size` (w, h, d) centered on `center`, both in renderer coordinates."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at(*center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, name, material, parent, bevel, segments, subdivide=subdivide)


def slab(name, size, base, material, parent=None, bevel=0.0, segments=3):
    """A box resting its base on `base` (x, y, z)."""
    x, y, z = base
    return box(name, size, (x, y + size[1] / 2, z), material, parent, bevel, segments)


def cylinder(name, radius, height, center, material, parent=None, vertices=24, axis="y", bevel=0.0, radius_top=None):
    """A cylinder along the renderer's `axis`, centered on `center`; a cone when `radius_top` differs."""
    if radius_top is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=(0, 0, 0))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius_top, depth=height, location=(0, 0, 0))
    obj = bpy.context.object
    if axis == "x":
        obj.rotation_euler = (0, math.pi / 2, 0)
    if axis == "z":
        obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.location = at(*center)
    _finish(obj, name, material, parent, bevel, smooth=True)
    for poly in obj.data.polygons:
        poly.use_smooth = abs(poly.normal.dot(Vector({"x": (1, 0, 0), "y": (0, 0, 1), "z": (0, 1, 0)}[axis]))) < 0.5
    return obj


def sphere(name, radius, center, material, parent=None, scale=(1, 1, 1), segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=radius, location=at(*center))
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, name, material, parent, smooth=True)


def capsule(name, radius, length, center, material, parent=None, squash=(1, 1)):
    """A capsule standing along y, `length` between its hemisphere centers; `squash` scales x and z."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=(0, 0, 0))
    obj = bpy.context.object
    for v in obj.data.vertices:
        v.co.z += length / 2 if v.co.z > 1e-6 else -length / 2 if v.co.z < -1e-6 else 0
    obj.scale = (squash[0], squash[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = at(*center)
    return _finish(obj, name, material, parent, smooth=True)


def torus(name, major, minor, center, material, parent=None, arc=2 * math.pi, rotation=(0, 0, 0)):
    """A torus in the renderer's xy plane (facing +z), swept `arc` radians from +x."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=10)
    obj = bpy.context.object
    if arc < 2 * math.pi:
        import bmesh

        bm = bmesh.new()
        bm.from_mesh(obj.data)
        doomed = [v for v in bm.verts if (math.atan2(v.co.y, v.co.x) % (2 * math.pi)) > arc + 1e-4]
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
    obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.rotation_euler = (rotation[0], -rotation[2], rotation[1])
    obj.location = at(*center)
    return _finish(obj, name, material, parent, smooth=True)


def empty(name, position, parent=None):
    """A pivot: its children rotate around it in the renderer."""
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = at(*position)
    if parent:
        obj.parent = parent
    return obj


def under(obj, parent):
    """Re-parents `obj` keeping its world position."""
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def out_path():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return args[0], (args[1] if len(args) > 1 else None)


def merge():
    """Joins the meshes that share a parent and a material: one draw call each. Pivots (empties) stay as they are."""
    bpy.context.view_layer.update()
    groups = {}
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            groups.setdefault((obj.parent.name if obj.parent else "", obj.data.materials[0].name), []).append(obj)
    for objs in groups.values():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.convert(target="MESH")
        if len(objs) > 1:
            bpy.ops.object.join()


def export(path):
    merge()
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True, export_extras=False, export_cameras=False, export_lights=False)


def preview(path, target=(0, 0.6, 0), distance=3.2, yaw=35, pitch=18):
    """A quick EEVEE render from the front-right, for looking at a model while working on it."""
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    scene.render.filepath = path
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.06, 0.09, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.4
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    t = at(*target)
    y, p = math.radians(yaw), math.radians(pitch)
    cam.location = t + at(math.sin(y) * math.cos(p) * distance, math.sin(p) * distance, math.cos(y) * math.cos(p) * distance)
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    bpy.context.collection.objects.link(sun)
    bpy.ops.render.render(write_still=True)
