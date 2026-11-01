import sys
from pathlib import Path
from PIL import Image

SRC = Path(r"c:/作業スペース/draft/sukemaru-channel/design/gemini/cut")
OUT = Path(r"c:/作業スペース/だれかなばあ/img")

ANIMALS = {
    "dog": ["normal", "happy", "bark"],
    "squirrel": ["normal", "happy", "nibble"],
    "seal": ["normal", "happy", "clap"],
    "cat": ["normal", "happy"],
    "rabbit": ["normal", "happy", "ear"],
    "panda": ["normal", "happy", "bamboo"],
    "penguin": ["normal", "happy", "flap"],
    "elephant": ["normal", "happy"],
    "lion": ["normal", "happy", "roar"],
}

def trim(im):
    a = im.getchannel("A").point(lambda v: 255 if v > 12 else 0)
    return im.crop(a.getbbox())

def save(im, name, h):
    w = round(im.width * h / im.height)
    im.resize((w, h), Image.LANCZOS).save(OUT / f"{name}.webp", "WEBP", quality=85, method=6)
    print(name, (w, h), (OUT / f"{name}.webp").stat().st_size // 1024, "KB")

for animal, poses in ANIMALS.items():
    for p in poses:
        save(trim(Image.open(SRC / f"{animal}_{p}.png").convert("RGBA")), f"{animal}_{p}", 440)

# すけまるの頭は表情を切り替えても位置がずれないよう、全表情の合わせた範囲で切る
heads = ["normal", "happy", "blink", "baa", "surprised"]
ims = [Image.open(SRC / f"head_{h}.png").convert("RGBA") for h in heads]
box = None
for im in ims:
    b = im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
for h, im in zip(heads, ims):
    save(im.crop(box), f"suke_{h}", 400)

bg = Image.open(SRC / "bg_rainbow_noflower.png").convert("RGB")
bg.save(OUT / "bg.webp", "WEBP", quality=82, method=6)
print("bg", bg.size, (OUT / "bg.webp").stat().st_size // 1024, "KB")

# アイコン：クリーム地にすけまるのにっこり顔（maskable の安全域に収まるよう中央60%）
head = trim(Image.open(SRC / "head_happy.png").convert("RGBA"))
for size in (512, 192, 180):
    icon = Image.new("RGBA", (size, size), (250, 243, 226, 255))
    s = size * 0.62 / max(head.size)
    hd = head.resize((round(head.width * s), round(head.height * s)), Image.LANCZOS)
    icon.alpha_composite(hd, ((size - hd.width) // 2, (size - hd.height) // 2 + round(size * 0.02)))
    name = "apple-touch-icon.png" if size == 180 else f"icon-{size}.png"
    icon.convert("RGB").save(OUT.parent / name)
    print(name)
