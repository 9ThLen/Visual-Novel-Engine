"""Extract single sprites from the preserved demo sheets without repainting pixels."""
from collections import deque
from pathlib import Path
from shutil import copy2

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'assets' / 'source-art'
# A point inside the chosen, disconnected pose on each original sheet.
POSES = {'guide': (850, 800), 'librarian': (270, 1200), 'reflection': (320, 800)}


def extract_pose(image, seed):
    image = image.convert('RGBA')
    width, height = image.size
    alpha = image.getchannel('A').tobytes()
    start = seed[1] * width + seed[0]
    if not alpha[start]:
        raise ValueError('The selected pose must start on an opaque pixel')
    mask = bytearray(width * height)
    mask[start] = alpha[start]
    queue = deque([start])
    while queue:
        index = queue.popleft()
        x, y = index % width, index // width
        for neighbor in (
            index - 1 if x else -1,
            index + 1 if x < width - 1 else -1,
            index - width if y else -1,
            index + width if y < height - 1 else -1,
        ):
            if neighbor >= 0 and alpha[neighbor] and not mask[neighbor]:
                mask[neighbor] = alpha[neighbor]
                queue.append(neighbor)
    image.putalpha(Image.frombytes('L', image.size, bytes(mask)))
    cropped = image.crop(image.getbbox())
    output = Image.new('RGBA', (cropped.width + 32, cropped.height + 32))
    output.paste(cropped, (16, 16))
    return output


if __name__ == '__main__':
    SOURCES.mkdir(exist_ok=True)
    for name, seed in POSES.items():
        target = ROOT / 'assets' / 'charakters' / f'char-{name}.png'
        source = SOURCES / f'char-{name}-sheet.png'
        if not source.exists():
            copy2(target, source)
        with Image.open(source) as original:
            output = extract_pose(original, seed)
            output.save(target)
            print(f'{target.name}: {output.width}x{output.height}, original preserved')
