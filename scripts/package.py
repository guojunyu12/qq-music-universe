from pathlib import Path
import zipfile

project = Path(__file__).resolve().parents[1]
target = project.parent / 'qq-music-universe-server.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in (project / 'dist').rglob('*'):
        if path.is_file():
            archive.write(path, path.relative_to(project / 'dist'))
    archive.write(project / 'DEPLOY.md', 'DEPLOY.md')
print(target)
