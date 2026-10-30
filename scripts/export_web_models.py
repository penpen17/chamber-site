"""Export the Blender scenes listed in scripts/web_models.json as web-ready .glb files.

Your .blend files are NOT changed: each scene is opened, simplified in memory,
exported, and closed without saving.

Run from the project folder (web_proto):

  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/export_web_models.py
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/export_web_models.py -- chamber   # just one model

What happens to each scene:
  1. Lights, cameras, hidden objects and objects matching "skip" are left out
     (hidden Boolean cutters are still used to cut holes before they are removed).
  2. Subdivision is lowered, very heavy meshes get a Decimate modifier ("maxTris"),
     and textures are shrunk to "maxTexture" pixels (default 1024).
  3. Everything is converted to plain meshes (curves, modifiers, geometry nodes applied).
  4. Objects are sorted into the named "groups"; each group becomes one clickable part.
  5. A compressed (Draco) .glb is written into public/models/.
"""
import json
import os
import re
import sys

import bpy

ROOT = os.getcwd()
CONFIG = os.path.join(ROOT, "scripts", "web_models.json")
only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def tri_count(obj, depsgraph):
    try:
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        n = sum(len(p.vertices) - 2 for p in mesh.polygons)
        ev.to_mesh_clear()
        return n
    except RuntimeError:
        return 0


def group_for(obj, rules, catch_all):
    """First rule whose regex matches the object's name or any parent's name."""
    names = []
    o = obj
    while o:
        names.append(o.name)
        o = o.parent
    for group, pattern in rules:
        if any(re.search(pattern, n, re.IGNORECASE) for n in names):
            return group
    return catch_all


def export_model(cfg):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, cfg["blend"]))
    scene = bpy.context.scene
    skip = re.compile(cfg["skip"]) if cfg.get("skip") else None

    # 1. Decide what the web viewer doesn't need. Lights and cameras are deleted now.
    #    Hidden/skipped objects are only deleted AFTER step 3, because some of them are
    #    Boolean cutters (e.g. the stage openings) that other objects still need.
    keep = set()
    for obj in list(scene.objects):
        if obj.type in {"LIGHT", "CAMERA", "LIGHT_PROBE", "SPEAKER"}:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.visible_get() and not (skip and skip.search(obj.name)):
            keep.add(obj.name)

    # Geometry Nodes "instances" (e.g. the nylon mesh fibres) are not real geometry yet:
    # add a Realize Instances node in front of each node tree's output.
    for tree in {m.node_group for o in scene.objects for m in getattr(o, "modifiers", []) if m.type == "NODES" and m.node_group}:
        out_node = next((n for n in tree.nodes if n.bl_idname == "NodeGroupOutput"), None)
        link = next((l for l in tree.links if l.to_node == out_node and l.to_socket.type == "GEOMETRY"), None) if out_node else None
        if link:
            realize = tree.nodes.new("GeometryNodeRealizeInstances")
            tree.links.new(link.from_socket, realize.inputs[0])
            tree.links.new(realize.outputs[0], link.to_socket)

    # 2. Lighter geometry: less subdivision, decimate very heavy meshes.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in scene.objects:
        for mod in getattr(obj, "modifiers", []):
            if mod.type == "SUBSURF":
                mod.levels = mod.render_levels = min(mod.levels, 1)
    depsgraph.update()
    for obj in scene.objects:
        if obj.type != "MESH" or obj.name not in keep:
            continue
        tris = tri_count(obj, depsgraph)
        if tris > cfg["maxTris"]:
            dec = obj.modifiers.new("web_decimate", "DECIMATE")
            dec.ratio = cfg["maxTris"] / tris
            print(f"  decimate {obj.name}: {tris} -> ~{cfg['maxTris']} tris")

    # Decide groups now, while the original parent hierarchy still exists.
    geometry = [o for o in scene.objects if o.name in keep and o.type in {"MESH", "CURVE", "FONT", "SURFACE", "META"}]
    groups = {o.name: group_for(o, cfg["groups"], cfg["catchAll"]) for o in geometry}

    # 3. Convert to plain meshes (applies modifiers, curve bevels and geometry nodes).
    bpy.ops.object.select_all(action="DESELECT")
    for o in geometry:
        o.select_set(True)
    bpy.context.view_layer.objects.active = geometry[0]
    bpy.ops.object.convert(target="MESH")
    meshes = [o for o in scene.objects if o.name in keep and o.type == "MESH" and len(o.data.polygons) > 0]

    # 4. Delete everything else (cutters are no longer needed), then flatten:
    #    each mesh goes directly under its group (world position kept).
    world = {o.name: o.matrix_world.copy() for o in meshes}
    for o in list(scene.objects):
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    empties = {}
    for o in meshes:
        name = groups.get(o.name, cfg["catchAll"])
        if name not in empties:
            empty = bpy.data.objects.new(name, None)
            scene.collection.objects.link(empty)
            empties[name] = empty
        o.parent = empties[name]
        o.matrix_parent_inverse.identity()
        o.matrix_world = world[o.name]
        o.animation_data_clear()  # baked-in animations would fight the exploded view

    total = sum(len(o.data.loop_triangles) or sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print(f"  groups: {sorted(empties)}  |  {len(meshes)} meshes, ~{total} tris")

    # Shrink huge textures (8K/4K) — on a web page 1024 px is plenty and loads much faster.
    max_tex = cfg.get("maxTexture", 1024)
    for img in bpy.data.images:
        w, h = img.size
        if img.users and max(w, h) > max_tex:
            k = max_tex / max(w, h)
            img.scale(int(w * k), int(h * k))
            print(f"  texture {img.name}: {w}x{h} -> {int(w * k)}x{int(h * k)}")

    # 5. Export.
    out = os.path.join(ROOT, cfg["out"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_image_format="WEBP",  # much smaller than PNG/JPEG; supported by all modern browsers
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    print(f"  wrote {cfg['out']} ({os.path.getsize(out) / 1e6:.2f} MB)")


config = json.load(open(CONFIG))
for model in config["models"]:
    if only and model["id"] not in only:
        continue
    print(f"=== {model['id']}: {model['blend']}")
    export_model(model)
