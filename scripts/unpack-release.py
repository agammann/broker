import hashlib,json,subprocess,zipfile,sys
from pathlib import Path,PurePosixPath
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
name=f'broker_{version}_source.zip'
directory=root/'release-artifacts'
archive=directory/name
digest=lambda data:hashlib.sha256(data).hexdigest()
checksum=digest(archive.read_bytes())+'  '+name+'\n'
manifestBytes=(directory/'release-manifest.json').read_bytes()
manifest=json.loads(manifestBytes)
assert (directory/(name+'.sha256')).read_text(encoding='utf-8')==checksum
assert (directory/'SHA256SUMS').read_text(encoding='utf-8')==checksum+digest(manifestBytes)+'  release-manifest.json\n'
assert manifest['repository']=='agammann/broker' and manifest['version']==version
assert manifest['source']=={'filename':name,'bytes':archive.stat().st_size,'sha256':digest(archive.read_bytes())}
for value in [manifest['commit'],manifest['tree']]:assert len(value)==40 and all(c in '0123456789abcdef' for c in value)
out=Path(sys.argv[1]).resolve()
assert not out.exists(),'Consumer output already exists; choose a fresh directory.'
prefix=f'broker-{version}/'
with zipfile.ZipFile(archive) as z:
 entries=z.infolist();names=[e.filename for e in entries]
 assert len(names)==len(set(names))
 assert z.comment.decode()==manifest['commit']
 for e in entries:
  assert e.filename.startswith(prefix)
  p=PurePosixPath(e.filename);assert not p.is_absolute() and '..' not in p.parts and '\\' not in e.filename
  assert (e.external_attr>>16)&0o170000!=0o120000
 assert sum(e.file_size for e in entries)<32*1024*1024
 assert all(not {'data','.secrets','node_modules','dist','web-dist','release-artifacts','consumer-output'}.intersection(PurePosixPath(e.filename).parts) for e in entries)
 if (root/'.git').exists():
  git=lambda *a:subprocess.check_output(['git',*a],cwd=root)
  assert manifest['commit']==git('rev-parse','HEAD').decode().strip()
  assert manifest['tree']==git('rev-parse','HEAD^{tree}').decode().strip()
  tracked=git('ls-files','-z').decode().split('\0')[:-1]
  assert sorted(e.filename[len(prefix):] for e in entries if not e.is_dir())==sorted(tracked)
  for item in tracked:assert z.read(prefix+item)==git('show','HEAD:'+item)
 z.extractall(out)
source=out/f'broker-{version}'
assert json.loads((source/'package.json').read_text(encoding='utf-8'))['license']=='MIT'
assert (source/'LICENSE').is_file() and (source/'pnpm-lock.yaml').is_file()
print(str(source))
