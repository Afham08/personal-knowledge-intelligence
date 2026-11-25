"""Validate the Chrome MV3 output and write a deterministic beta ZIP."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import struct
import zipfile

root = Path(__file__).resolve().parents[1]
build = root / ".output/chrome-mv3"
manifest = json.loads((build / "manifest.json").read_bytes())
version = json.loads((root / "package.json").read_bytes())["version"]


def require(condition, message):
    if not condition:
        raise SystemExit(message)


class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" or (tag == "link" and attrs.get("rel") in ("modulepreload", "stylesheet")):
            required.add(attrs["src" if tag == "script" else "href"].lstrip("/"))


require(manifest["version_name"] == version and manifest["version"] == version.replace("-beta.", "."), "Version mismatch")
require(manifest["manifest_version"] == 3 and "content_security_policy" in manifest, "Missing MV3 production policy")
required = {"manifest.json", "extract-article.js", "annotate.js", "THIRD-PARTY-NOTICES.txt",
            manifest["background"]["service_worker"], manifest["side_panel"]["default_path"]}
Assets().feed((build / manifest["side_panel"]["default_path"]).read_text(encoding="utf8"))
workers = list(build.glob("assets/pdf.worker.min-*.mjs"))
require(len(workers) == 1, "Missing bundled PDF worker")
required.add(workers[0].relative_to(build).as_posix())
for size in (16, 32, 48, 128):
    icon = manifest["icons"][str(size)]
    header = (build / icon).read_bytes()
    require(header.startswith(b"\x89PNG\r\n\x1a\n") and struct.unpack(">II", header[16:24]) == (size, size), "Invalid icon")
    required.add(icon)
files = sorted(p.relative_to(build).as_posix() for p in build.rglob("*") if p.is_file())
require(required.issubset(files), "Required production file missing")
for name in files:
    require(name in required or re.fullmatch(r"(chunks/[\w-]+\.js|assets/[\w-]+\.css)", name), "Unexpected distribution file: " + name)
archive = build.parent / f"pki-{version}-chrome-mv3.zip"
with zipfile.ZipFile(archive, "w") as output:
    for name in files:
        entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        output.writestr(entry, (build / name).read_bytes())
with zipfile.ZipFile(archive) as output:
    require(output.namelist() == files and output.testzip() is None, "ZIP integrity failure")
    for name in files:
        require(output.read(name) == (build / name).read_bytes(), "ZIP differs from build")
print(f"{archive} ({len(files)} files) SHA256 {sha256(archive.read_bytes()).hexdigest()}")
