import json
import hashlib
import math
import os
from pathlib import Path

import addon_utils
import bmesh
import bpy
import numpy as np
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(os.environ["VRCLUB_CHARACTER_TOOLS"])
ASSETS = TOOLS / "assets"
WARDROBE = os.environ.get("AVATAR_WARDROBE") == "1"
OUTPUT = ROOT / "design" / "characters" / ("wardrobe" if WARDROBE else "base")
OUTPUT.mkdir(parents=True, exist_ok=True)

bpy.context.preferences.extensions.repos.new(
    name="Avatar experiment",
    module="avatar_experiment",
    custom_directory=str(TOOLS / "extensions"),
)
addon_utils.enable("bl_ext.avatar_experiment.mpfb", default_set=True)
from bl_ext.avatar_experiment.mpfb import set_preference
from bl_ext.avatar_experiment.mpfb.services.humanservice import HumanService
from bl_ext.avatar_experiment.mpfb.services.locationservice import LocationService
from bl_ext.avatar_experiment.mpfb.services.targetservice import TargetService
from bl_ext.avatar_experiment.mpfb.services.exportservice import ExportService

set_preference("mpfb_second_root", str(ASSETS))
LocationService.update_second_root()

CAST = [
    dict(id="amara", label="Amara", description="Adult woman, fuller build, afro, midnight cut-out dress",
         gender=0.0, age=0.52, weight=0.65, muscle=0.42, height=0.48, heightMetres=1.64,
         race=dict(african=0.85, asian=0.05, caucasian=0.10),
         skin="young_african_female", hair="afro01", clothes="toigo_cut_out_dress", shoes="shoes02",
         clothingTint=[0.035, 0.045, 0.09]),
    dict(id="jin", label="Jin", description="Mature fictional male DJ, lean face, dark loosely parted wavy hair curling around the ears and nape, charcoal crew-neck tee and jeans",
         gender=1.0, age=0.82, weight=0.38, muscle=0.42, height=0.50, heightMetres=1.78,
         race=dict(african=0.08, asian=0.12, caucasian=0.80),
         skin="old_caucasian_male", hair="long01", clothes="male_casualsuit06", shoes="shoes01",
         hairShape="loose-nape-waves", hairTint=[0.035, 0.026, 0.020], clothingTint=[0.055, 0.06, 0.07]),
    dict(id="ellis", label="Ellis", description="Older man, lean build, silver hair",
         gender=1.0, age=0.90, weight=0.38, muscle=0.35, height=0.58, heightMetres=1.87,
         race=dict(african=0.10, asian=0.10, caucasian=0.80),
         skin="old_caucasian_male", hair="short04", clothes="male_elegantsuit01", shoes="shoes01"),
    dict(id="leila", label="Leila", description="Adult woman, flowing teal camisole dress, long hair",
         gender=0.0, age=0.56, weight=0.48, muscle=0.38, height=0.50, heightMetres=1.70,
         race=dict(african=0.25, asian=0.30, caucasian=0.45),
         skin="young_caucasian_female", hair="long01",
         clothes="toigo_camisole_dress_with_full_skirt", shoes="shoes02", clothingTint=[0.03, 0.36, 0.32]),
    dict(id="nia", label="Nia", description="Middle-aged woman, fuller build, knee-length violet halter dress",
         gender=0.0, age=0.70, weight=0.68, muscle=0.42, height=0.45, heightMetres=1.66,
         race=dict(african=0.90, asian=0.05, caucasian=0.05),
         skin="middleage_african_female", hair="afro01",
         clothes="toigo_halter_dress_knee_length", shoes="shoes02", clothingTint=[0.32, 0.07, 0.40]),
    dict(id="mei", label="Mei", description="Older woman, silver bob, blouse and skirt",
         gender=0.0, age=0.88, weight=0.48, muscle=0.35, height=0.40, heightMetres=1.59,
         race=dict(african=0.05, asian=0.90, caucasian=0.05),
         skin="old_asian_female", hair="bob02", clothes="female_elegantsuit01", shoes="shoes02",
         hairTint=[0.55, 0.55, 0.57], clothingTint=[0.12, 0.22, 0.35]),
    dict(id="sofia", label="Sofia", description="Adult woman, athletic build, burgundy shift dress, ponytail",
         gender=0.0, age=0.54, weight=0.43, muscle=0.72, height=0.43, heightMetres=1.62,
         race=dict(african=0.15, asian=0.15, caucasian=0.70),
         skin="young_caucasian_female2", hair="ponytail01",
         clothes="toigo_shift_dress", shoes="shoes02", clothingTint=[0.38, 0.04, 0.10]),
    dict(id="rosa", label="Rosa", description="Adult woman, curvy build, graphite cropped top and trousers",
         gender=0.0, age=0.62, weight=0.70, muscle=0.45, height=0.51, heightMetres=1.73,
         race=dict(african=0.35, asian=0.10, caucasian=0.55),
         skin="middleage_caucasian_female", hair="braid01", clothes="female_sportsuit01", shoes="shoes02",
         clothingTint=[0.07, 0.085, 0.10]),
    dict(id="malik", label="Malik", description="Adult man, muscular build, forest fitted shirt and trousers",
         gender=1.0, age=0.56, weight=0.58, muscle=0.85, height=0.56, heightMetres=1.85,
         race=dict(african=0.92, asian=0.04, caucasian=0.04),
         skin="young_african_male", hair="short01", clothes="male_casualsuit01", shoes="shoes01",
         clothingTint=[0.08, 0.32, 0.18]),
    dict(id="luca", label="Luca", description="Adult man, lean build, ivory long-sleeve top and dark trousers, longer hair",
         gender=1.0, age=0.60, weight=0.42, muscle=0.48, height=0.50, heightMetres=1.79,
         race=dict(african=0.08, asian=0.12, caucasian=0.80),
         skin="young_caucasian_male2", hair="short03", clothes="male_casualsuit02", shoes="shoes01",
         clothingTint=[0.68, 0.65, 0.58]),
    dict(id="alex", label="Alex", description="Nonbinary adult, androgynous build, amber cropped T-shirt and trousers",
         identity="nonbinary", pronouns="they/them",
         gender=0.45, age=0.55, weight=0.48, muscle=0.55, height=0.48, heightMetres=1.72,
         race=dict(african=0.15, asian=0.65, caucasian=0.20),
         skin="young_asian_female", hair="short04", clothes="female_sportsuit01", shoes="shoes02",
         clothingTint=[0.58, 0.35, 0.06]),
    dict(id="river", label="River", description="Nonbinary adult, broad build, plum blouse and skirt, bob",
         identity="nonbinary", pronouns="they/them",
         gender=0.65, age=0.68, weight=0.62, muscle=0.48, height=0.54, heightMetres=1.81,
         race=dict(african=0.50, asian=0.10, caucasian=0.40),
         skin="middleage_african_male", hair="bob01", clothes="female_elegantsuit01", shoes="shoes02",
         clothingTint=[0.25, 0.07, 0.22]),
    dict(id="asha", label="Asha", description="Adult woman, lean athletic build, bronze cut-out dress, bob",
         gender=0.0, age=0.59, weight=0.44, muscle=0.62, height=0.54, heightMetres=1.76,
         race=dict(african=0.70, asian=0.20, caucasian=0.10),
         skin="young_african_female", hair="bob01", clothes="toigo_cut_out_dress", shoes="shoes04",
         clothingTint=[0.56, 0.28, 0.04]),
    dict(id="vera", label="Vera", description="Older woman, fuller build, silver braid, charcoal blouse and skirt",
         gender=0.0, age=0.92, weight=0.63, muscle=0.30, height=0.49, heightMetres=1.69,
         race=dict(african=0.06, asian=0.04, caucasian=0.90),
         skin="old_caucasian_female", hair="braid01", clothes="female_elegantsuit01", shoes="shoes03",
         hairTint=[0.58, 0.56, 0.53], clothingTint=[0.10, 0.11, 0.13]),
    dict(id="hana", label="Hana", description="Adult woman, petite build, blue fluted halter dress, long hair",
         gender=0.0, age=0.57, weight=0.40, muscle=0.40, height=0.38, heightMetres=1.55,
         race=dict(african=0.02, asian=0.95, caucasian=0.03),
         skin="young_asian_female", hair="long01", clothes="toigo_halter_dress_with_fluted_skirt", shoes="shoes04",
         clothingTint=[0.05, 0.14, 0.42]),
    dict(id="zara", label="Zara", description="Adult fictional female DJ, slender build, long side-parted blonde hair, charcoal tee and jeans",
         gender=0.0, age=0.60, weight=0.40, muscle=0.40, height=0.46, heightMetres=1.68,
         race=dict(african=0.08, asian=0.07, caucasian=0.85),
         skin="middleage_caucasian_female", hair="long01", clothes="male_casualsuit06", shoes="shoes05",
         hairTint=[0.65, 0.51, 0.30], clothingTint=[0.055, 0.06, 0.07]),
    dict(id="iris", label="Iris", description="Adult woman, tall slender build, copper bob, silver cropped top and trousers",
         gender=0.0, age=0.53, weight=0.35, muscle=0.42, height=0.60, heightMetres=1.83,
         race=dict(african=0.10, asian=0.05, caucasian=0.85),
         skin="young_caucasian_female2", hair="bob02", clothes="female_sportsuit01", shoes="shoes06",
         hairTint=[0.38, 0.12, 0.04], clothingTint=[0.62, 0.58, 0.49]),
    dict(id="luz", label="Luz", description="Adult woman, shorter curvy build, red keyhole dress, ponytail",
         gender=0.0, age=0.65, weight=0.60, muscle=0.50, height=0.42, heightMetres=1.61,
         race=dict(african=0.40, asian=0.10, caucasian=0.50),
         skin="middleage_caucasian_female", hair="ponytail01", clothes="toigo_keyhole_neck_dress", shoes="shoes04",
         clothingTint=[0.45, 0.06, 0.07]),
    dict(id="sana", label="Sana", description="Middle-aged woman, medium build, teal blouse and skirt, dark bob",
         gender=0.0, age=0.72, weight=0.55, muscle=0.55, height=0.47, heightMetres=1.68,
         race=dict(african=0.10, asian=0.60, caucasian=0.30),
         skin="middleage_asian_female", hair="bob01", clothes="female_elegantsuit01", shoes="shoes03",
         clothingTint=[0.04, 0.24, 0.26]),
    dict(id="eden", label="Eden", description="Adult woman, athletic build, plum midi halter dress, bob",
         gender=0.0, age=0.60, weight=0.47, muscle=0.70, height=0.53, heightMetres=1.74,
         race=dict(african=0.40, asian=0.10, caucasian=0.50),
         skin="young_african_female", hair="bob02", clothes="toigo_halter_dress_midi", shoes="shoes04",
         clothingTint=[0.30, 0.05, 0.23]),
    dict(id="owen", label="Owen", description="Adult man, sturdy build, denim-style button shirt and trousers",
         gender=1.0, age=0.58, weight=0.62, muscle=0.65, height=0.52, heightMetres=1.82,
         race=dict(african=0.08, asian=0.07, caucasian=0.85),
         skin="young_caucasian_male", hair="short02", clothes="male_casualsuit01", shoes="shoes03"),
    dict(id="kwame", label="Kwame", description="Older man, broad build, grey short hair, warm jacket and trousers",
         gender=1.0, age=0.86, weight=0.66, muscle=0.48, height=0.55, heightMetres=1.86,
         race=dict(african=0.95, asian=0.02, caucasian=0.03),
         skin="old_african_male", hair="short04", clothes="male_casualsuit05", shoes="shoes01",
         hairTint=[0.37, 0.38, 0.39], clothingTint=[0.30, 0.20, 0.09]),
    dict(id="tao", label="Tao", description="Older man, medium build, silver hair, navy tailored suit",
         gender=1.0, age=0.89, weight=0.51, muscle=0.42, height=0.46, heightMetres=1.72,
         race=dict(african=0.03, asian=0.91, caucasian=0.06),
         skin="old_asian_male", hair="short01", clothes="male_elegantsuit01", shoes="shoes01",
         hairTint=[0.58, 0.59, 0.60], clothingTint=[0.04, 0.08, 0.16]),
    dict(id="diego", label="Diego", description="Adult man, athletic build, russet T-shirt and trousers, longer hair",
         gender=1.0, age=0.54, weight=0.48, muscle=0.76, height=0.51, heightMetres=1.81,
         race=dict(african=0.32, asian=0.08, caucasian=0.60),
         skin="young_caucasian_male2", hair="short03", clothes="male_casualsuit04", shoes="shoes05",
         clothingTint=[0.42, 0.12, 0.05]),
    dict(id="noah", label="Noah", description="Adult man, short fuller build, teal T-shirt and jeans",
         gender=1.0, age=0.56, weight=0.74, muscle=0.40, height=0.39, heightMetres=1.64,
         race=dict(african=0.05, asian=0.15, caucasian=0.80),
         skin="young_caucasian_male", hair="short02", clothes="male_casualsuit06", shoes="shoes06",
         clothingTint=[0.04, 0.28, 0.36]),
    dict(id="idris", label="Idris", description="Middle-aged man, tall broad build, braid, crimson jacket and trousers",
         gender=1.0, age=0.69, weight=0.60, muscle=0.62, height=0.61, heightMetres=1.94,
         race=dict(african=0.86, asian=0.06, caucasian=0.08),
         skin="middleage_african_male", hair="braid01", clothes="male_casualsuit05", shoes="shoes03",
         clothingTint=[0.34, 0.05, 0.06]),
    dict(id="ren", label="Ren", description="Adult man, slender build, bob, long-sleeve tee and trousers",
         gender=0.85, age=0.52, weight=0.36, muscle=0.45, height=0.47, heightMetres=1.71,
         race=dict(african=0.03, asian=0.90, caucasian=0.07),
         skin="young_asian_male", hair="bob02", clothes="male_casualsuit02", shoes="shoes05",
         clothingTint=[0.17, 0.14, 0.35]),
    dict(id="samir", label="Samir", description="Adult man, medium build, ochre patterned shirt and trousers",
         gender=1.0, age=0.63, weight=0.58, muscle=0.53, height=0.50, heightMetres=1.80,
         race=dict(african=0.18, asian=0.32, caucasian=0.50),
         skin="middleage_caucasian_male", hair="short01", clothes="male_casualsuit03", shoes="shoes01",
         clothingTint=[0.41, 0.24, 0.06]),
    dict(id="felix", label="Felix", description="Older man, lean build, silver hair, olive button shirt and trousers",
         gender=1.0, age=0.93, weight=0.38, muscle=0.48, height=0.48, heightMetres=1.76,
         race=dict(african=0.05, asian=0.05, caucasian=0.90),
         skin="old_caucasian_male", hair="short04", clothes="male_casualsuit01", shoes="shoes04",
         hairTint=[0.65, 0.64, 0.60], clothingTint=[0.28, 0.34, 0.08]),
    dict(id="ari", label="Ari", description="Adult man, soft medium build, long hair, silver-grey blouse and skirt",
         gender=0.90, age=0.55, weight=0.50, muscle=0.40, height=0.56, heightMetres=1.88,
         race=dict(african=0.12, asian=0.16, caucasian=0.72),
         skin="young_caucasian_male2", hair="long01", clothes="female_elegantsuit01", shoes="shoes03",
         clothingTint=[0.32, 0.38, 0.46]),
    dict(id="robin", label="Robin", description="Nonbinary adult, short fuller build, charcoal jacket and trousers",
         identity="nonbinary", pronouns="they/them",
         gender=0.50, age=0.64, weight=0.65, muscle=0.46, height=0.43, heightMetres=1.67,
         race=dict(african=0.12, asian=0.70, caucasian=0.18),
         skin="middleage_asian_male", hair="short02", clothes="male_casualsuit05", shoes="shoes05",
         clothingTint=[0.075, 0.085, 0.11]),
    dict(id="kai", label="Kai", description="Nonbinary adult, tall lean build, bob, violet tailored suit",
         identity="nonbinary", pronouns="they/them",
         gender=0.35, age=0.51, weight=0.43, muscle=0.52, height=0.55, heightMetres=1.78,
         race=dict(african=0.76, asian=0.12, caucasian=0.12),
         skin="young_african_female", hair="bob02", clothes="male_elegantsuit01", shoes="shoes04",
         clothingTint=[0.24, 0.09, 0.32]),
]
CAST.extend([
    dict(id="mara", label="Mara", description="Adult woman, tall broad build, copper braid, rose halter dress",
         gender=0.0, age=0.73, weight=0.61, muscle=0.58, height=0.56, heightMetres=1.79,
         race=dict(african=0.12, asian=0.58, caucasian=0.30),
         skin="middleage_asian_female", hair="braid01", clothes="toigo_halter_dress_with_fluted_skirt", shoes="shoes03",
         hairTint=[0.30, 0.11, 0.05], clothingTint=[0.48, 0.24, 0.32]),
    dict(id="jonas", label="Jonas", description="Older man, shorter stocky build, silver hair, indigo T-shirt and jeans",
         gender=1.0, age=0.86, weight=0.72, muscle=0.44, height=0.43, heightMetres=1.71,
         race=dict(african=0.34, asian=0.42, caucasian=0.24),
         skin="old_asian_male", hair="short03", clothes="male_casualsuit04", shoes="shoes06",
         hairTint=[0.48, 0.47, 0.45], clothingTint=[0.08, 0.12, 0.40]),
])

NIGHT_OUT = {
    "asha": dict(clothes="punkduck_high_neck_crop_top", bottom="cortu_cargo_pants",
                 hair="toigo_curled_under_bob", description="Adult woman, lean athletic build, bronze high-neck crop top and cargo trousers, curled-under bob"),
    "iris": dict(clothes="toigo_turtleneck_halter_top", bottom="cortu_cargo_pants",
                 hair="toigo_inverted_bob", description="Adult woman, tall slender build, copper inverted bob, stone halter top and cargo trousers"),
    "rosa": dict(clothes="toigo_camisole_top", bottom="toigo_tiered_mini_skirt",
                 hair="toigo_blunt_bob_with_bangs", description="Adult woman, curvy build, blunt bob with bangs, graphite camisole and tiered mini skirt"),
    "vera": dict(clothes="toigo_fisherman_sweater", bottom="toigo_wool_pants",
                 description="Older woman, fuller build, silver braid, charcoal knit sweater and tailored trousers"),
    "alex": dict(clothes="toigo_keyhole_tank_top", bottom="cortu_cargo_pants",
                 hair="cortu_short_messy_hair", description="Nonbinary adult, androgynous build, short textured hair, amber keyhole tank and cargo trousers"),
    "noah": dict(clothes="namuhekam_male_polo_shirt", bottom="toigo_wool_pants",
                 hair="cortu_short_messy_hair", description="Adult man, short fuller build, short textured hair, teal polo and tailored trousers"),
    "owen": dict(clothes="toigo_basic_tucked_t-shirt", bottom="cortu_cargo_pants",
                 description="Adult man, sturdy build, tucked T-shirt and cargo trousers"),
    "leila": dict(hair="toigo_blunt_bob_with_bangs",
                  description="Adult woman, flowing teal camisole dress, blunt bob with bangs"),
    "mei": dict(hair="toigo_inverted_bob_with_bangs",
                description="Older woman, silver inverted bob with bangs, blouse and skirt"),
    "diego": dict(hair="cortu_short_messy_hair",
                  description="Adult man, athletic build, russet T-shirt and trousers, short textured hair"),
}
for person in CAST:
    person.update(NIGHT_OUT.get(person["id"], {}))


def asset_path(category, name, suffix):
    path = ASSETS / category / name / f"{name}.{suffix}"
    if not path.is_file():
        raise FileNotFoundError(path)
    return str(path)


def asset_license(name):
    entry = license_manifest.get(name)
    if entry and entry["license"] == "CC0":
        return "CC0-1.0"
    approved = attribution_assets.get(name)
    if entry and entry["license"] == "CC-BY" and approved and approved.get("license") == "CC-BY-4.0":
        source = Path(asset_path(entry["type"], name, "mhclo"))
        if hashlib.sha256(source.read_bytes()).hexdigest() == approved["mhcloSha256"]:
            return approved["license"]
    raise RuntimeError(f"Unverified asset licence: {name}")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


PRINTED_TOPS = {"male_casualsuit02", "male_casualsuit04", "male_casualsuit06"}
FOOTWEAR = {
    "loafers": "shoes03",
    "pumps": "toigo_ballet_flats",
    "heels": "toigo_stiletto_booties",
}
WOMEN_FOOTWEAR = {
    "amara": "pumps", "nia": "heels", "sofia": "pumps", "asha": "heels",
    "leila": "loafers", "iris": "loafers", "rosa": "pumps", "mei": "loafers",
    "luz": "heels", "hana": "pumps", "vera": "loafers", "alex": "loafers",
    "sana": "loafers", "zara": "heels", "mara": "pumps", "eden": "pumps",
}


def add_footwear(body, character, style):
    source = character["shoes"] if style == "original" else FOOTWEAR[style]
    if source not in license_manifest or license_manifest[source]["license"] != "CC0":
        raise RuntimeError(f"Unverified footwear asset: {source}")
    obj = HumanService.add_mhclo_asset(asset_path("clothes", source, "mhclo"), body,
                                      asset_type="Clothes", material_type="GAMEENGINE", subdiv_levels=0)
    modern = style != "original" or character.get("footwearStyle") in FOOTWEAR
    if modern and source == "shoes03":
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        remaining = set(mesh.verts)
        components = []
        while remaining:
            pending = [remaining.pop()]
            component = set(pending)
            while pending:
                for edge in pending.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in remaining:
                            remaining.remove(vertex)
                            component.add(vertex)
                            pending.append(vertex)
            components.append(component)
        if sorted(map(len, components)) != [52] * 8 + [144] * 2 + [759] * 2:
            raise RuntimeError("Unexpected shoes03 sock/lace topology")
        bmesh.ops.delete(mesh, geom=[vertex for component in components if len(component) != 759
                                     for vertex in component], context="VERTS")
        mesh.to_mesh(obj.data)
        mesh.free()
        delete_group = body.vertex_groups.get("Delete.shoes03")
        if delete_group:
            delete_group.remove([vertex.index for vertex in body.data.vertices])
            delete_group.add([vertex.index for vertex in body.data.vertices if vertex.co.z < 0.035], 1, "REPLACE")
    if modern:
        floor = min(vertex.co.z for vertex in obj.data.vertices)
        if not -0.2 < floor < 0.05:
            raise RuntimeError(f"Unexpected fitted footwear ground level: {source}: {floor}")
        for vertex in obj.data.vertices:
            vertex.co.z -= floor
        if source == "shoes03":
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            bmesh.ops.bisect_plane(
                mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                dist=0.000001, plane_co=(0, 0, 0.095), plane_no=(0, 0, 1),
                clear_outer=True, clear_inner=False)
            mesh.to_mesh(obj.data)
            mesh.free()
        # Leave leather thickness around the fitted foot after independent mesh decimation.
        for side in (-1, 1):
            vertices = [vertex for vertex in obj.data.vertices if vertex.co.x * side > 0]
            centre_x = (min(vertex.co.x for vertex in vertices) + max(vertex.co.x for vertex in vertices)) / 2
            centre_y = (min(vertex.co.y for vertex in vertices) + max(vertex.co.y for vertex in vertices)) / 2
            for vertex in vertices:
                vertex.co.x = centre_x + (vertex.co.x - centre_x) * 1.06
                vertex.co.y = centre_y + (vertex.co.y - centre_y) * (1.12 if source == "shoes03" else 1.04)
        if source == "toigo_stiletto_booties":
            height = max(vertex.co.z for vertex in obj.data.vertices)
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            bmesh.ops.bisect_plane(
                mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                dist=0.000001, plane_co=(0, 0, height * 0.8), plane_no=(0, 0, 1),
                clear_outer=True, clear_inner=False)
            mesh.to_mesh(obj.data)
            mesh.free()
            delete_group = body.vertex_groups.get(f"Delete.{source}")
            if delete_group is None:
                raise RuntimeError("The fitted ankle boots require their authored body mask")
            cutoff = height * 0.35
            delete_group.add([vertex.index for vertex in body.data.vertices if vertex.co.z < cutoff], 1, "REPLACE")
        elif source == "toigo_ballet_flats":
            delete_group = body.vertex_groups.get(f"Delete.{source}")
            if delete_group:
                delete_group.remove([vertex.index for vertex in body.data.vertices])
        obj["experiment_footwear_colour"] = {
            "shoes03": [0.055, 0.032, 0.024],
            "toigo_ballet_flats": [0.035, 0.027, 0.038],
            "toigo_stiletto_booties": [0.028, 0.024, 0.032],
        }[source]
    obj["experiment_source"] = source
    return obj


def material_pixels(material, size, tint=None, plain_top=False, footwear_colour=None):
    nodes = material.node_tree.nodes
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    socket = principled.inputs["Base Color"]
    image = None
    if socket.is_linked:
        upstream = socket.links[0].from_node
        if upstream.type == "TEX_IMAGE":
            image = upstream.image
        else:
            raise RuntimeError(f"Unsupported base color graph: {material.name}: {upstream.type}")
    if image:
        copy = image.copy()
        copy.scale(size, size)
        pixels = np.empty(size * size * 4, dtype=np.float32)
        copy.pixels.foreach_get(pixels)
        pixels = pixels.reshape((size, size, 4))
        bpy.data.images.remove(copy)
    else:
        pixels = np.empty((size, size, 4), dtype=np.float32)
        pixels[:] = socket.default_value[:]
    if plain_top:
        # These verified UV layouts put the shirt in the upper half and jeans below it.
        fabric = np.median(pixels[int(size * 0.65):int(size * 0.9),
                                  int(size * 0.04):int(size * 0.25), :3], axis=(0, 1))
        pixels[size // 2:, :, :3] = fabric
    if footwear_colour is not None:
        pixels[:, :, :3] = footwear_colour
        pixels[:, :, 3] = 1
    if tint:
        pixels[:, :, :3] = pixels[:, :, :3] * 0.25 + np.array(tint, dtype=np.float32) * 0.75
    return pixels


def shape_dj_hair(hair, rig):
    """Keep the CC0 parted roots and replace pageboy ends with head-skinned waves."""
    head = rig.data.bones["head"]
    crown = max(vertex.co.z for vertex in hair.data.vertices)
    bottom = min(vertex.co.z for vertex in hair.data.vertices)
    neck = head.head_local.z
    cut = neck + 0.045
    nape = neck - 0.055
    mesh = bmesh.new()
    mesh.from_mesh(hair.data)
    bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                          dist=0.00001, plane_co=(0, 0, cut), plane_no=(0, 0, 1),
                          clear_inner=True)
    if not bottom < nape < cut < crown or len(mesh.verts) < 100:
        raise RuntimeError("The verified long01 hair no longer fits Jin's head landmarks")
    uv_layer = mesh.loops.layers.uv.active
    deform = mesh.verts.layers.deform.verify()
    group = hair.vertex_groups.get("head") or hair.vertex_groups.new(name="head")
    pixels = material_pixels(hair.data.materials[0], 64)
    opaque = np.argwhere(pixels[:, :, 3] > 0.98)
    if len(opaque) < 16:
        raise RuntimeError("The verified long01 texture has no opaque curl colour")
    row, column = opaque[len(opaque) // 2]
    curl_uv = ((float(column) + 0.5) / 64, (float(row) + 0.5) / 64)
    clumps = []
    for side in (-1, 1):
        for index, (x, y) in enumerate(((0.065, -0.040), (0.083, 0.005),
                                       (0.075, 0.050), (0.050, 0.080))):
            phase = index * 0.9
            length = 0.135 if index == 0 else 0.185
            def path(t, side=side, x=x, y=y, phase=phase, length=length):
                wave = math.sin(math.tau * t + phase) * math.sin(math.pi * t)
                return Vector((side * (x - 0.020 * (1 - t) ** 3 + 0.025 * math.sin(math.pi * t) + 0.016 * wave - 0.020 * t ** 4),
                               head.head_local.y + y + 0.014 * wave,
                               neck + 0.125 - length * t + 0.030 * t ** 6))
            clumps.append(path)
    for index in range(5):
        x = (index - 2) * 0.030
        def path(t, x=x, phase=index * 0.8):
            wave = math.sin(math.tau * t + phase) * math.sin(math.pi * t)
            return Vector((x + 0.012 * wave,
                           head.head_local.y + 0.090 - 0.025 * (1 - t) ** 3 + 0.025 * math.sin(math.pi * t) - 0.025 * t ** 4,
                           neck + 0.115 - 0.195 * t + 0.030 * t ** 6))
        clumps.append(path)
    for path in clumps:
        rings = []
        for step in range(19):
            t = step / 18
            centre = path(t)
            tangent = (path(min(1, t + 0.001)) - path(max(0, t - 0.001))).normalized()
            radial = Vector((centre.x, centre.y - head.head_local.y, 0)).normalized()
            across = tangent.cross(radial).normalized()
            normal = tangent.cross(across).normalized()
            radius = 0.030 * math.sin(math.pi * t) ** 0.45 * (1 - t) ** 0.35 + 0.001
            ring = []
            for section in range(8):
                angle = section / 8 * math.tau
                vertex = mesh.verts.new(centre + radius * (across * math.cos(angle) + normal * math.sin(angle) * 0.22))
                vertex[deform][group.index] = 1.0
                ring.append(vertex)
            if rings:
                for section in range(8):
                    face = mesh.faces.new((rings[-1][section], rings[-1][(section + 1) % 8],
                                           ring[(section + 1) % 8], ring[section]))
                    face.smooth = True
                    for loop in face.loops:
                        loop[uv_layer].uv = curl_uv
            rings.append(ring)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(hair.data)
    mesh.free()
    print("DJ_HAIR_FIT", json.dumps({"source": "long01", "style": "loose-nape-waves",
          "originalBottom": bottom, "nape": nape, "neck": neck, "crown": crown,
          "vertices": len(hair.data.vertices), "authoredWaveClumps": len(clumps)}), flush=True)


def atlas_material(objects, name, transparent=False, tint=None, neutral=False):
    slots = []
    for obj in objects:
        for index, slot in enumerate(obj.material_slots):
            if slot.material is None:
                raise RuntimeError(f"Empty material on {obj.name}")
            slots.append((obj, index, slot.material))
    grid = math.ceil(math.sqrt(len(slots)))
    size = 512 if transparent else 1024
    cell = size // grid
    pixels = np.ones((size, size, 4), dtype=np.float32)
    for tile, (obj, index, material) in enumerate(slots):
        x, y = (tile % grid) * cell, (tile // grid) * cell
        if index == 0:
            obj["experiment_atlas_rect"] = [
                (x + 4) / size, 1 - (y + cell - 4) / size,
                (x + cell - 4) / size, 1 - (y + 4) / size,
            ]
        # Padding plus inset UVs prevents neighbouring atlas cells bleeding at seams.
        content = material_pixels(material, cell - 8, tint=obj.get("experiment_tint", tint),
                                  plain_top=obj.get("experiment_plain_top", False),
                                  footwear_colour=obj.get("experiment_footwear_colour"))
        if neutral:
            grey = content[:, :, :3].mean(axis=2)
            reference = max(0.05, float(np.percentile(grey, 85)))
            content[:, :, :3] = np.minimum(1.0, grey[:, :, None] / reference)
        pixels[y:y + cell, x:x + cell] = np.pad(
            content, ((4, 4), (4, 4), (0, 0)), mode="edge")
        uv = obj.data.uv_layers.active
        if uv is None:
            raise RuntimeError(f"Missing UVs: {obj.name}")
        for polygon in obj.data.polygons:
            if polygon.material_index == index:
                for loop in polygon.loop_indices:
                    coord = uv.data[loop].uv
                    coord.x = (x + 4 + coord.x * (cell - 8)) / size
                    coord.y = (y + 4 + coord.y * (cell - 8)) / size
    if not transparent:
        pixels[:, :, 3] = 1.0
    image = bpy.data.images.new(name, width=size, height=size, alpha=transparent)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(OUTPUT / f"{name}.png")
    image.file_format = "PNG"
    image.save()
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (1, 1, 1, 1)
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.83
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Emission Strength"].default_value = 0.0
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    material.use_backface_culling = not transparent
    if transparent:
        material.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
        material.alpha_threshold = 0.5
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
    return material


def relax_arms(rig):
    for side, sign in (("l", 1), ("r", -1)):
        for name, goal in (
            (f"upperarm_{side}", Vector((sign * 0.10, -0.025, -0.31))),
            (f"lowerarm_{side}", Vector((sign * 0.025, -0.08, -0.24))),
        ):
            bone = rig.pose.bones[name]
            bone.rotation_mode = "QUATERNION"
            bpy.context.view_layer.update()
            direction = (bone.tail - bone.head).normalized()
            swing = direction.rotation_difference(goal.normalized())
            matrix = bone.matrix.copy()
            rotation = swing @ matrix.to_quaternion()
            target = rotation.to_matrix().to_4x4()
            target.translation = matrix.translation
            bone.matrix = target
            bpy.context.view_layer.update()


def generate_wardrobe(character, body, rig):
    parts = [body]
    eyes = HumanService.add_mhclo_asset(asset_path("eyes", "low-poly", "mhclo"), body,
                                      asset_type="Eyes", material_type="GAMEENGINE", subdiv_levels=0)
    shoes = {}
    shoe_groups = {}
    for style in ("original", *FOOTWEAR):
        shoe = add_footwear(body, character, style)
        shoe.name = f"wardrobe_shoes_{style}"
        shoes[style] = shoe
        shoe_groups[style] = body.vertex_groups.get(f"Delete.{shoe['experiment_source']}")
    parts.extend([eyes, *shoes.values()])
    variants = []
    outfits = {
        "original": [character["clothes"], *([character["bottom"]] if character.get("bottom") else [])],
        "casual": ["male_casualsuit04" if character["clothes"] == "male_casualsuit06" else "male_casualsuit06"],
        "smart": ["male_elegantsuit01" if character["clothes"] == "male_casualsuit01" else "male_casualsuit01"],
    }
    for kind, choices in (
        ("hair", dict(original=[character["hair"]],
                      short=[("toigo_inverted_bob" if character["hair"] == "toigo_blunt_bob_with_bangs" else
                              "toigo_blunt_bob_with_bangs") if character["gender"] < 0.7 else
                             "short03" if character["hair"] == "cortu_short_messy_hair" else "cortu_short_messy_hair"],
                      long=["ponytail01" if character["hair"] == "long01" else "long01"])),
        ("outfit", outfits),
    ):
        for option, names in choices.items():
            objects = []
            for name in names:
                asset_license(name)
                obj = HumanService.add_mhclo_asset(
                    asset_path("hair" if kind == "hair" else "clothes", name, "mhclo"), body,
                    asset_type="Hair" if kind == "hair" else "Clothes",
                    material_type="GAMEENGINE", subdiv_levels=0)
                obj.name = f"wardrobe_{kind}_{option}"
                obj["experiment_plain_top"] = name in PRINTED_TOPS
                objects.append(obj)
                parts.append(obj)
            variants.append((kind, option, objects))
    set_active(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    atlas_material([body], "wardrobe_skin", neutral=True)
    colours = body.data.color_attributes.new(name="footwearMasks", type="FLOAT_COLOR", domain="POINT")
    for vertex in body.data.vertices:
        flags = []
        for group in shoe_groups.values():
            flags.append(float(group is not None and any(item.group == group.index and item.weight >= 0.5 for item in vertex.groups)))
        colours.data[vertex.index].color = flags
    body.data.color_attributes.active_color = colours
    skins = []
    for option, garments in outfits.items():
        skin = body.copy()
        skin.data = body.data.copy()
        bpy.context.collection.objects.link(skin)
        skin.name = f"wardrobe_skin_{option}"
        keep = {"body", *(f"Delete.{garment}" for garment in garments)}
        for modifier in list(skin.modifiers):
            if modifier.type == "SUBSURF" or modifier.type == "MASK" and modifier.vertex_group not in keep:
                skin.modifiers.remove(modifier)
        set_active(skin)
        ExportService.bake_modifiers_remove_helpers(skin, bake_masks=True, bake_subdiv=False, also_proxy=False)
        skins.append(skin)
    parts.remove(body)
    bpy.data.objects.remove(body, do_unlink=True)
    for obj in parts:
        for modifier in list(obj.modifiers):
            if modifier.type in ("MASK", "SUBSURF"):
                obj.modifiers.remove(modifier)
    parts.extend(skins)
    atlas_material([eyes, *shoes.values()], "wardrobe_accessories")
    for kind, option, objects in variants:
        material = atlas_material(objects, f"wardrobe_{kind}_{option}", transparent=kind == "hair", neutral=True)
        if kind == "outfit":
            bottom = material.copy()
            bottom.name = f"wardrobe_bottom_{option}"
            material.name = f"wardrobe_top_{option}"
            height = max(vertex.co.z for vertex in skins[0].data.vertices)
            for index, obj in enumerate(objects):
                obj.data.materials.append(bottom)
                for face in obj.data.polygons:
                    z = sum(obj.data.vertices[vertex].co.z for vertex in face.vertices) / len(face.vertices)
                    face.material_index = index if len(objects) > 1 else int(z < height * 0.52)
        if len(objects) > 1:
            set_active(objects[0])
            for obj in objects[1:]:
                parts.remove(obj)
                obj.select_set(True)
            bpy.ops.object.join()
    for obj in parts:
        set_active(obj)
        target = 4500 if obj in skins else 900 if obj == eyes or obj in shoes.values() or "hair" in obj.name else 2600
        triangles = sum(len(face.vertices) - 2 for face in obj.data.polygons)
        modifier = obj.modifiers.new("Wardrobe triangle budget", "DECIMATE")
        modifier.ratio = min(1.0, target / max(1, triangles))
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for face in obj.data.polygons:
            face.use_smooth = True
    for shoe in shoes.values():
        eye_copy = eyes.copy()
        eye_copy.data = eyes.data.copy()
        bpy.context.collection.objects.link(eye_copy)
        set_active(shoe)
        eye_copy.select_set(True)
        bpy.ops.object.join()
    parts.remove(eyes)
    bpy.data.objects.remove(eyes, do_unlink=True)
    relax_arms(rig)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in rig.children:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f"{character['id']}.glb"),
                              export_format="GLB", use_selection=True, export_animations=False,
                              export_morph=False, export_skins=True, export_def_bones=True,
                              export_vertex_color="ACTIVE",
                              export_image_format="AUTO", export_extras=False, export_materials="EXPORT")
    print("WARDROBE_COMPLETE", character["id"], flush=True)


manifest_path = ROOT / "design" / "characters" / "recipes.json"
existing = {item["id"]: item for item in json.loads(manifest_path.read_text())} if manifest_path.exists() else {}
only = set(filter(None, os.environ.get("AVATAR_ONLY", "").split(",")))
if only - {character["id"] for character in CAST}:
    raise ValueError(f"Unknown requested characters: {only}")
license_manifest = {}
for pack in ("makehuman_system_assets", "dress01", "shoes01", "hair01", "shirts01", "skirts01", "pants01", "shirts03"):
    license_manifest.update(json.loads((ASSETS / "packs" / f"{pack}.json").read_text()))
attribution_assets = {
    entry["id"]: entry
    for pack in json.loads((ROOT / "design" / "characters" / "provenance.json").read_text())["fashionPacks"]
    for entry in pack["selectedAssets"]
}
for character in CAST:
    if character["id"] in WOMEN_FOOTWEAR:
        character["footwearStyle"] = WOMEN_FOOTWEAR[character["id"]]
        character["shoes"] = FOOTWEAR[character["footwearStyle"]]
    if WARDROBE and character["id"] not in {
        "nia", "asha", "sofia", "iris", "leila", "amara", "mei", "rosa",
        "tao", "luca", "diego", "ellis", "felix", "malik", "ren", "samir", "idris"
    }:
        continue
    if only and character["id"] not in only:
        if character["id"] not in existing:
            raise ValueError(f"Missing unselected character: {character['id']}")
        continue
    if character["age"] < 0.5:
        raise ValueError("This nightclub experiment uses adult-only MakeHuman age targets.")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    macro = TargetService.get_default_macro_info_dict()
    for key in ("gender", "age", "weight", "muscle", "height", "race"):
        macro[key] = character[key]
    body = HumanService.create_human(macro_detail_dict=macro)
    HumanService.set_character_skin(asset_path("skins", character["skin"], "mhmat"),
                                    body, skin_type="GAMEENGINE")
    rig = HumanService.add_builtin_rig(body, "game_engine")
    if rig is None:
        raise RuntimeError("MPFB game_engine rig could not be created")
    body.name = f"{character['id']}_skin"
    if WARDROBE:
        generate_wardrobe(character, body, rig)
        continue
    parts = [body]
    sources = [character["skin"]]
    hair = None
    for category, name, kind in (
        ("eyes", "low-poly", "Eyes"),
        ("eyebrows", "eyebrow001", "Eyebrows"),
        ("hair", character["hair"], "Hair"),
        *(("clothes", name, "Clothes") for name in
          [character["clothes"], *([character["bottom"]] if character.get("bottom") else [])]),
    ):
        obj = HumanService.add_mhclo_asset(
            asset_path(category, name, "mhclo"), body, asset_type=kind,
            material_type="GAMEENGINE", subdiv_levels=0)
        parts.append(obj)
        sources.append(name)
        if kind == "Hair":
            hair = obj
            if character.get("hairShape") == "loose-nape-waves":
                shape_dj_hair(hair, rig)
        if name in (character["clothes"], character.get("bottom")) and character.get("clothingTint"):
            obj["experiment_tint"] = character["clothingTint"]
        if name == character["clothes"]:
            obj["experiment_plain_top"] = name in PRINTED_TOPS
    shoe = add_footwear(body, character, "original")
    parts.append(shoe)
    sources.append(character["shoes"])
    licences = list(dict.fromkeys(asset_license(source) for source in sources))
    # Freeze generated shape keys before the clothing masks and decimation.
    set_active(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=True)
    for obj in parts:
        set_active(obj)
        for modifier in list(obj.modifiers):
            if modifier.type in ("MASK", "SUBSURF"):
                if modifier.type == "SUBSURF":
                    obj.modifiers.remove(modifier)
                else:
                    bpy.ops.object.modifier_apply(modifier=modifier.name)
    opaque = [obj for obj in parts if obj != hair]
    # Eyebrow cards use the skin colour underneath instead of opaque rectangular cards.
    brows = next(obj for obj in opaque if getattr(obj, "MPFB_GEN_object_type", "") == "Eyebrows")
    opaque.remove(brows)
    bpy.data.objects.remove(brows, do_unlink=True)
    parts.remove(brows)
    atlas_material(opaque, f"{character['id']}_opaque")
    eye_atlas = list(next(obj for obj in opaque if getattr(obj, "MPFB_GEN_object_type", "") == "Eyes")["experiment_atlas_rect"])
    atlas_material([hair], f"{character['id']}_hair", transparent=True,
                   tint=character.get("hairTint", (0.65, 0.65, 0.65) if character["id"] == "ellis" else None))
    total = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in parts)
    ratio = min(1.0, 9500 / total)
    for obj in parts:
        set_active(obj)
        modifier = obj.modifiers.new("Prototype triangle budget", "DECIMATE")
        modifier.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for face in obj.data.polygons:
            face.use_smooth = True
    set_active(opaque[0])
    for obj in opaque:
        obj.select_set(True)
    bpy.ops.object.join()
    opaque_mesh = bpy.context.object
    opaque_mesh.name = f"{character['id']}_body_outfit"
    relax_arms(rig)
    base = {bone.name: bone.rotation_quaternion.copy() for bone in rig.pose.bones}
    bpy.context.scene.render.fps = 30
    for frame in range(1, 122, 4):
        phase = (frame - 1) / 120 * math.tau
        for name, amount in (("spine_02", 0.012), ("head", 0.025)):
            bone = rig.pose.bones[name]
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = base[name] @ Quaternion((1, 0, 0), math.sin(phase) * amount)
            bone.keyframe_insert("rotation_quaternion", frame=frame)
        for side in ("l", "r"):
            bone = rig.pose.bones[f"upperarm_{side}"]
            bone.keyframe_insert("rotation_quaternion", frame=frame)
            bone = rig.pose.bones[f"lowerarm_{side}"]
            bone.keyframe_insert("rotation_quaternion", frame=frame)
    rig.animation_data.action.name = "Prototype_Breathing"
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 121
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    heights = [(obj.matrix_world @ Vector(corner)).z
               for obj in (opaque_mesh.evaluated_get(depsgraph), hair.evaluated_get(depsgraph))
               for corner in obj.bound_box]
    rig.scale *= character["heightMetres"] / (max(heights) - min(heights))
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (rig, opaque_mesh, hair):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / f"{character['id']}.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / f"{character['id']}.glb"),
        export_format="GLB", use_selection=True, export_animations=True,
        export_frame_range=True, export_morph=False, export_skins=True,
        export_def_bones=True, export_image_format="AUTO",
        export_extras=False, export_materials="EXPORT",
    )
    existing[character["id"]] = {
        **character, "sources": sources, "license": " AND ".join(licences),
        "eyeAtlas": eye_atlas,
        "plainTop": character["clothes"] in PRINTED_TOPS,
        "expression": {"style": "source-neutral", "targets": {}},
        "triangles": sum(sum(len(face.vertices) - 2 for face in obj.data.polygons)
                         for obj in (opaque_mesh, hair)),
        "materials": 2, "textureSizes": [1024, 512],
        "bytes": (OUTPUT / f"{character['id']}.glb").stat().st_size,
        "bones": len(rig.data.bones),
        "hairAlpha": "MASK; production hair is alpha-tested and writes depth",
        "animation": "Base breathing reference; scripts/characters/build.mjs authors production role/player clips and procedural DJ rigs",
    }
    print("CHARACTER_COMPLETE", json.dumps(existing[character["id"]]), flush=True)
if not WARDROBE:
    manifest_path.write_text(json.dumps([existing[character["id"]] for character in CAST], indent=2))
print("EXPERIMENT_COMPLETE", flush=True)
