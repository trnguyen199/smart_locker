from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / 'outputs' / 'Smart_Locker_Digital_Twin.zip'
folders = ['frontend', 'backend', 'shared', 'scripts']
files = ['package.json', 'tsconfig.base.json', 'README.md', 'DESIGN.md', 'VERIFICATION.md', '.gitignore', 'premium-ui.json', 'premium-audit.json']
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    selected = [root / f for f in files]
    selected += [p for f in folders for p in (root / f).rglob('*') if p.is_file() and not {'node_modules', 'dist', '__pycache__'}.intersection(p.relative_to(root).parts)]
    for path in selected:
        if path.exists():
            archive.write(path, Path('smart-locker-digital-twin') / path.relative_to(root))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    print(f'{output}\n{len(archive.namelist())} files; archive CRC verified')
