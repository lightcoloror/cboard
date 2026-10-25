"""Recreate archived test layout without downloading dependencies or running tests."""
from pathlib import Path
import argparse,shutil,re,json
p=argparse.ArgumentParser();p.add_argument('--workspace',required=True);p.add_argument('--cboard',required=True);a=p.parse_args()
target=Path(a.workspace).resolve();repo=Path(a.cboard).resolve();source=Path(__file__).parent/'evidence'
if target.exists():raise SystemExit('Choose a new empty workspace path')
if not (repo/'node_modules/@playwright/test/package.json').is_file():raise SystemExit('Existing Playwright runtime required; no automatic downloads')
target.mkdir(parents=True)
for f in source.rglob('*'):
 if not f.is_file():continue
 q=target/'outputs'/f.relative_to(source);q.parent.mkdir(parents=True,exist_ok=True)
 if f.suffix in ['.cjs','.js']:
  text=f.read_text(encoding='utf-8')
  text=re.sub(r"(['\"])(?:\.\./)+fork-cboard/cboard/([^'\"]+)\1",lambda m:json.dumps((repo/m[2]).as_posix()),text)
  text=text.replace('<WORKSPACE>',target.as_posix()).replace('<USER_HOME>',Path.home().as_posix())
  q.write_text(text,encoding='utf-8')
 else:shutil.copy2(f,q)
print(json.dumps({'workspace':str(target),'cboard':str(repo),'status':'created_no_tests_run','downloads':0}))
