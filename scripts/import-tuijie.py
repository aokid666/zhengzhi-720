"""Import only GitHub-validated banks and guarded lecture overlays; existing banks stay byte-identical."""
import argparse,json,pathlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text())
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
def main():
 ap=argparse.ArgumentParser();ap.add_argument('integration',type=pathlib.Path);args=ap.parse_args();src=args.integration;books=read(src/'books.json');assert {b['id'] for b in books}=={'tuijie8','tuijie-selftest','tuijie-manual-exercises'}
 for b in books:
  bank=read(src/'practice'/f'{b["id"]}.json');manifest=read(src/'manifests'/f'{b["id"]}.json');assert b['count']==len(bank['questions']);assert len(manifest['pages'])==b['pages']==len(bank['pages']);assert b['sha256']==manifest['pdfSha256'];assert len(b['pageUrls'])==b['pages'];assert all(p['bytes']>0 and len(p['sha256'])==64 and p['ext'] in ['png','jpg'] for p in manifest['pages'])
  for q in bank['questions']:
   assert q['id'].startswith('pr-'+b['id']+'-') and q['qRefs'] and q['keyRefs'];assert q['analysis'][0]['t'].strip()
   if q['type']=='choice':assert set(q['options'])==set('ABCD') and q['answer'] and all(q['options'].values())
   for r in q['qRefs']+q['keyRefs']:assert 0<r['page']<=b['pages'] and r['b'][2]>0 and r['b'][3]>0
  write(ROOT/'data/practice'/f'{b["id"]}.json',bank)
 index=read(ROOT/'data/practice-index.json');ids={b['id'] for b in books};index['books']=[b for b in index['books'] if b['id'] not in ids]+books;index['total']=sum(b['count'] for b in index['books']);index['version']=133;write(ROOT/'data/practice-index.json',index)
 manifests=read(ROOT/'data/practice-sources.json');manifests=[m for m in manifests if m['id'] not in ids]+[read(src/'manifests'/f'{id}.json') for id in sorted(ids)];write(ROOT/'data/practice-sources.json',manifests)
 for folder in ['extra-links','lecture-links']:
  dest=ROOT/'data'/folder;dest.mkdir(exist_ok=True)
  for p in (src/folder).glob('*.json'):shutil.copyfile(p,dest/p.name)
 shutil.copyfile(src/'extra-lectures.json',ROOT/'data/extra-lectures.json');shutil.copyfile(src/'report.json',ROOT/'data/tuijie-import-report.json');print('Imported',[(b['title'],b['count']) for b in books],'total',index['total'])
if __name__=='__main__':main()
