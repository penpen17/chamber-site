"""Convert a microscopy video (e.g. a Fiji .avi) into a web-friendly .mp4 (H.264),
using the video converter built into Blender — no ffmpeg installation needed.

Run from the project folder (web_proto):

  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/convert_video.py -- \
      assets_source/microscopy/root_tip_tracking_day1.avi public/videos/root_tip_tracking_day1.mp4

Optional 3rd argument: maximum width in pixels (default 1280). Smaller = smaller file.
"""
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])
max_width = int(args[2]) if len(args) > 2 else 1280

scene = bpy.context.scene
scene.sequence_editor_create()
strips = scene.sequence_editor.strips if hasattr(scene.sequence_editor, "strips") else scene.sequence_editor.sequences
movie = strips.new_movie("video", src, channel=1, frame_start=1)

# Same size (shrunk to max_width if wider), same speed and length as the original.
w, h = movie.elements[0].orig_width, movie.elements[0].orig_height
k = min(1.0, max_width / w)
scene.render.resolution_x = int(w * k) // 2 * 2  # H.264 needs even sizes
scene.render.resolution_y = int(h * k) // 2 * 2
scene.render.resolution_percentage = 100
fps = movie.fps if hasattr(movie, "fps") else scene.render.fps
scene.render.fps, scene.render.fps_base = round(fps), 1
scene.frame_start, scene.frame_end = 1, movie.frame_final_duration

# H.264 in an MP4 container, good quality, no audio.
if hasattr(scene.render.image_settings, "media_type"):  # Blender 5+: choose "video" first
    scene.render.image_settings.media_type = "VIDEO"
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.ffmpeg.ffmpeg_preset = "GOOD"
scene.render.ffmpeg.audio_codec = "NONE"
scene.render.use_file_extension = False
scene.render.filepath = dst

print(f"Converting {src}: {w}x{h} -> {scene.render.resolution_x}x{scene.render.resolution_y}, "
      f"{movie.frame_final_duration} frames at {fps} fps")
bpy.ops.render.render(animation=True)
print(f"Wrote {dst} ({os.path.getsize(dst) / 1e6:.2f} MB)")
