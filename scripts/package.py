"""테스트 자료 없이 런타임 파일만 재현 가능한 순서로 묶는다."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
destination = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / f"airplane-chime-timer-{manifest['version']}.zip"
files = [
    'manifest.json', 'background.js', 'popup.html', 'popup.css', 'popup.js',
    '692.js', '692.js.LICENSE.txt', 'audio-player.html', 'audio-player.js',
    'welcome.html', 'onboarding.js'
]
for folder in ('icons', 'sounds'):
    files.extend(str(path.relative_to(root)).replace('\\', '/') for path in (root / folder).rglob('*') if path.is_file())
for filename in files:
    if not (root / filename).is_file():
        raise FileNotFoundError(filename)
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for filename in sorted(files):
        info = zipfile.ZipInfo(filename, date_time=(2026, 10, 2, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (root / filename).read_bytes())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('manifest.json'))['version'] == manifest['version']
print(json.dumps({'path':str(destination),'version':manifest['version'],'files':len(files),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()},indent=2))
