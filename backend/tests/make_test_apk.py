"""Build a minimal real-format APK (binary AXML manifest) for upload tests."""
import os
import struct
import sys
import zipfile


def axml(pkg, vcode, vname):
    strs = ["versionCode", "versionName", "android", "http://schemas.android.com/apk/res/android", "", "manifest", "package", pkg, vname]
    data, offs = b"", []
    for s in strs:
        offs.append(len(data))
        data += struct.pack("<H", len(s)) + s.encode("utf-16le") + b"\0\0"
    data += b"\0" * (-len(data) % 4)
    start = 28 + 4 * len(strs)
    sp = struct.pack("<HHIIIIII", 1, 28, start + len(data), len(strs), 0, 0, start, 0) + b"".join(struct.pack("<I", o) for o in offs) + data
    rm = struct.pack("<HHI", 0x180, 8, 16) + struct.pack("<II", 0x0101021B, 0x0101021C)
    ns = struct.pack("<HHIIiII", 0x100, 16, 24, 1, -1, 2, 3)
    attrs = [(-1, 6, 7, 0x03, 7), (3, 0, -1, 0x10, vcode), (3, 1, 8, 0x03, 8)]
    ab = b"".join(struct.pack("<iiiHBBI", a, b, c, 8, 0, t, d) for a, b, c, t, d in attrs)
    se = struct.pack("<HHIIiiiHHHHHH", 0x102, 16, 36 + len(ab), 1, -1, -1, 5, 20, 20, len(attrs), 0, 0, 0) + ab
    ee = struct.pack("<HHIIiii", 0x103, 16, 24, 1, -1, -1, 5)
    en = struct.pack("<HHIIiII", 0x101, 16, 24, 1, -1, 2, 3)
    body = sp + rm + ns + se + ee + en
    return struct.pack("<HHI", 3, 8, 8 + len(body)) + body


def build(path, pkg="app.azoapp.homeservice", vcode=16, vname="1.6.0", pad_mb=0):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        z.writestr("AndroidManifest.xml", axml(pkg, vcode, vname))
        if pad_mb:
            z.writestr("assets/blob.bin", os.urandom(pad_mb * 1024 * 1024))
    return path


if __name__ == "__main__":
    build(sys.argv[1], pad_mb=int(sys.argv[2]) if len(sys.argv) > 2 else 0)
