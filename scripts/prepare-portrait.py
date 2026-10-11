"""Generate the MVP portrait asset and inferred relative-depth map locally.
Usage: python scripts/prepare-portrait.py <reference.png> <model.onnx>
Requires pillow, numpy, onnxruntime only during asset preparation.
"""
from pathlib import Path
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image

destination = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
image = Image.open(sys.argv[1]).convert('RGB')
image.thumbnail((1400, 2492), Image.Resampling.LANCZOS)
image.save(destination / 'portrait-mvp.jpg', quality=93, subsampling=0)
width = round(518 * image.width / image.height / 14) * 14
pixels = np.asarray(image.resize((width, 518), Image.Resampling.BICUBIC), dtype=np.float32) / 255
pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
session = ort.InferenceSession(sys.argv[2], providers=['CPUExecutionProvider'])
depth = session.run(None, {'pixel_values': pixels.transpose(2, 0, 1)[None]})[0].squeeze()
low, high = np.percentile(depth, [1, 99])
assert high > low, 'Depth estimation produced a flat map'
normalized = np.clip((depth - low) / (high - low), 0, 1)
Image.fromarray((normalized * 255).astype(np.uint8)).resize(image.size, Image.Resampling.BICUBIC).save(destination / 'portrait-depth.png')
print(f'Portrait {image.size}; inferred depth {depth.shape}; contrast {high-low:.3f}')
