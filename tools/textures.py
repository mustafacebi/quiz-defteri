"""
Eski defter görünümü için doku görsellerini üretir (img/ klasörüne).

Kullanım (proje klasöründeyken):
    python3 tools/textures.py

Tüm dokular "döşenebilir"dir (tileable): yan yana konunca ek yeri belli olmaz.
Bunun sırrı gürültünün FFT ile üretilmesi; FFT doğası gereği periyodiktir.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "img"
N = 1024
rng = np.random.default_rng(7)


def noise(beta, shape=(N, N), stretch=(1.0, 1.0)):
    """1/f^beta gürültü: beta büyüdükçe daha yumuşak, bulut gibi. Sonuç 0..1."""
    white = rng.standard_normal(shape)
    ky = np.fft.fftfreq(shape[0])[:, None] * stretch[0]
    kx = np.fft.fftfreq(shape[1])[None, :] * stretch[1]
    k = np.sqrt(kx**2 + ky**2)
    k[0, 0] = 1
    field = np.real(np.fft.ifft2(np.fft.fft2(white) / k**beta))
    return (field - field.min()) / (field.max() - field.min())


def wrap_draw(draw_fn):
    """Kenardan taşan şekli karşı kenarda da çizer ki doku dikişsiz olsun."""
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            draw_fn(dx, dy)


def fibers(count, length, alpha):
    """Kâğıt lifleri: kısa, hafif kıvrık, rastgele açık/koyu çizgiler."""
    layer = Image.new("LA", (N, N), (128, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = rng.uniform(0, N, 2)
        angle = rng.uniform(0, np.pi)
        ln = rng.uniform(*length)
        bend = rng.uniform(-0.4, 0.4)
        pts = [(x + np.cos(angle + bend * t) * ln * t, y + np.sin(angle + bend * t) * ln * t)
               for t in np.linspace(0, 1, 6)]
        shade = 255 if rng.random() < 0.5 else 0
        a = int(rng.uniform(0.3, 1) * alpha)
        wrap_draw(lambda dx, dy: d.line([(px + dx, py + dy) for px, py in pts], fill=(shade, a), width=1))
    return layer.filter(ImageFilter.GaussianBlur(0.6))


def spots(count, radius, color, alpha):
    """Sararma lekeleri (foxing): yumuşak kenarlı küçük kahverengi noktalar."""
    layer = Image.new("RGBA", (N, N), color + (0,))
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = rng.uniform(0, N, 2)
        r = rng.uniform(*radius)
        a = int(rng.uniform(0.3, 1) * alpha)
        wrap_draw(lambda dx, dy: d.ellipse([x + dx - r, y + dy - r, x + dx + r, y + dy + r], fill=color + (a,)))
    return layer.filter(ImageFilter.GaussianBlur(radius[1] * 0.6))


def paper(base, aged, mottle_amount, name, fiber_count=2600, spot_count=55):
    clouds = noise(2.1)
    medium = noise(1.3)
    mix = np.clip(clouds * 0.75 + medium * 0.25, 0, 1)[..., None] * mottle_amount
    rgb = np.array(base) * (1 - mix) + np.array(aged) * mix
    rgb += rng.normal(0, 2.2, (N, N, 1))  # ince tane
    img = Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB").convert("RGBA")

    fib = fibers(fiber_count, (4, 18), 16)
    lum, alpha = fib.split()
    fib_rgba = Image.merge("RGBA", (lum, lum, lum, alpha))
    img = Image.alpha_composite(img, fib_rgba)
    img = Image.alpha_composite(img, spots(spot_count, (1.5, 6), (150, 105, 55), 70))
    img = Image.alpha_composite(img, spots(6, (14, 30), (170, 125, 70), 22))
    img.convert("RGB").save(OUT / name, quality=86, optimize=True)


def wood(name):
    yy = np.mgrid[0:N, 0:N][0] / N
    # stretch'te x katsayısı büyükse gürültü yatayda yavaş değişir -> uzun damarlar
    warp = noise(2.3, stretch=(1, 6)) * 5
    rings = (0.5 + 0.5 * np.sin(2 * np.pi * (yy * 34 + warp))) ** 3  # ince koyu çizgiler
    streaks = noise(0.75, stretch=(1, 40))
    tone = noise(2.2, stretch=(1, 3))
    t = np.clip(0.4 * tone + 0.45 * streaks + 0.15 * (1 - rings), 0, 1)
    t = (t - t.min()) / (t.max() - t.min())
    # dört tahta: her birleşimde ince koyu bir çizgi
    seam = np.zeros(N)
    for edge in range(0, N, N // 4):
        seam[edge:edge + 2] = 0.55
    t = np.clip(t - seam[:, None], 0, 1)[..., None]
    dark, light = np.array([40, 25, 16]), np.array([104, 68, 42])
    rgb = dark * (1 - t) + light * t + rng.normal(0, 2, (N, N, 1))
    Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB").save(OUT / name, quality=84, optimize=True)


def linen(name):
    yy, xx = np.mgrid[0:N, 0:N]
    threads = 256  # 1024 px içinde tam sayıda iplik -> dikişsiz
    weave = (np.sin(2 * np.pi * xx * threads / N) * np.sin(2 * np.pi * yy * threads / N)) * 0.5
    slub_x = noise(1.0, stretch=(1, 0.02))
    slub_y = noise(1.0, stretch=(0.02, 1))
    t = np.clip(0.5 + weave * 0.25 + (slub_x - 0.5) * 0.5 + (slub_y - 0.5) * 0.5, 0, 1)[..., None]
    rgb = np.array([150, 140, 122]) * (1 - t) + np.array([196, 187, 168]) * t
    Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB").save(OUT / name, quality=84, optimize=True)


def leather(name, size=512):
    """Deri: tümsekli bir yükseklik haritası üret, üstten gelen ışıkla gölgelendir."""
    shape = (size, size)  # varsayılan shape=(N, N) tanım anında sabitlendiği için açıkça veriyoruz
    grain = np.abs(noise(0.9, shape) - 0.5)  # ince kırışıklar
    pebble = noise(1.4, shape)               # tümsekler
    height = pebble * 0.6 - grain * 0.8
    gy, gx = np.gradient(height)
    shade = np.clip(0.5 + (-gx * 0.7 - gy * 0.7) * 38, 0, 1)
    tone = noise(2.2, shape)[..., None]
    base = np.array([74, 44, 28]) * (1 - tone * 0.35) + np.array([104, 64, 40]) * tone * 0.35
    rgb = base * (0.72 + 0.55 * shade[..., None]) + rng.normal(0, 1.5, shape + (1,))
    Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB").save(OUT / name, quality=86, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    paper((246, 239, 222), (226, 205, 160), 0.55, "paper.jpg")
    paper((236, 220, 182), (196, 160, 105), 0.8, "parchment.jpg", fiber_count=3400, spot_count=90)
    wood("wood.jpg")
    leather("leather.jpg")
    for f in sorted(OUT.glob("*.jpg")):
        print(f.name, f.stat().st_size // 1024, "KB")
