import math
import os
import struct
import zlib

SIZE = 256


def sd_rrect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ox = max(qx, 0.0)
    oy = max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - r


TRI = [(98.0, 84.0), (98.0, 172.0), (182.0, 128.0)]


def tri_signed_dist(px, py):
    dmin = 1e9
    n = len(TRI)
    for i in range(n):
        x1, y1 = TRI[i]
        x2, y2 = TRI[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        length = math.hypot(ex, ey)
        cross = (px - x1) * ey - (py - y1) * ex
        d = cross / length
        if d < dmin:
            dmin = d
    return dmin


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def render():
    pixels = bytearray()
    cx = cy = SIZE / 2
    hw = hh = SIZE / 2 - 6
    r = 54
    accent = (99, 102, 241)
    cyan = (34, 211, 238)
    top = (21, 27, 41)
    bottom = (10, 13, 20)

    for y in range(SIZE):
        for x in range(SIZE):
            px = x + 0.5
            py = y + 0.5

            d = sd_rrect(px, py, cx, cy, hw, hh, r)
            cov_bg = clamp(0.5 - d, 0.0, 1.0)

            bg = lerp_color(top, bottom, py / SIZE)

            gx, gy = 150.0, 110.0
            gd = math.hypot(px - gx, py - gy)
            glow = clamp(1.0 - gd / 190.0, 0.0, 1.0) ** 2 * 0.34
            cr = int(bg[0] + (accent[0] - bg[0]) * glow)
            cg = int(bg[1] + (accent[1] - bg[1]) * glow)
            cb = int(bg[2] + (accent[2] - bg[2]) * glow)

            dt = tri_signed_dist(px, py)
            cov_tri = clamp(dt + 0.5, 0.0, 1.0)
            t = clamp(((px - 98.0) + (py - 84.0)) / ((182.0 - 98.0) + (172.0 - 84.0)), 0.0, 1.0)
            tc = lerp_color(accent, cyan, t)

            fr = int(cr + (tc[0] - cr) * cov_tri)
            fg = int(cg + (tc[1] - cg) * cov_tri)
            fb = int(cb + (tc[2] - cb) * cov_tri)
            fa = cov_bg

            pixels += bytes((fr, fg, fb, int(fa * 255)))
    return bytes(pixels)


def png_chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)


def to_png(pixels, size):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n'
            + png_chunk(b'IHDR', ihdr)
            + png_chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + png_chunk(b'IEND', b''))


def main():
    outdir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')
    os.makedirs(outdir, exist_ok=True)

    png = to_png(render(), SIZE)

    with open(os.path.join(outdir, 'icon.png'), 'wb') as f:
        f.write(png)

    ico = struct.pack('<HHH', 0, 1, 1)
    ico += struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22)
    ico += png
    with open(os.path.join(outdir, 'icon.ico'), 'wb') as f:
        f.write(ico)

    print('OK', len(png), 'bytes png')


if __name__ == '__main__':
    main()
