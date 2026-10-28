"""Import validated cloud output without replacing the already-recorded history/ethics exercises."""
import argparse,concurrent.futures,json,pathlib,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];BASE='https://aokid666.github.io/zz-second-hat-2027/'
def fetch(n):
 with urllib.request.urlopen(BASE+'data/'+n+'.json?check='+str(time.time_ns()),timeout=40) as r:return json.load(r)
def obtain():
 report=fetch('build-report');books=fetch('books');manifest=fetch('source-manifests')
 assert report['errors']==[] and sorted(report['reused'])==['ethics-match','history-second']
 assert len(books)==8 and report['matchingCount']==103 and report['clozeCount']>600
 with concurrent.futures.ThreadPoolExecutor() as ex:banks=dict(zip([b['id'] for b in books],ex.map(fetch,[b['id'] for b in books])))
 for b in books:
  qs=banks[b['id']]['questions'];m=next(m for m in manifest if m['id']==b['id']);assert len(qs)==b['count'] and len(m['pages'])==b['pages'];assert m['pdfSha256']==b['sha256']
  for q in qs:
   assert q['qRefs'] and q['keyRefs']
   if q['type']=='cloze':
    assert q['cloze']['masks'] and q['cloze']['rule']!='review'
    assert all(all(not a<=i<z for a,z in q['cloze']['protected']) for m in q['cloze']['masks'] for i in m['indices'])
 for id,pn in [('second-marx',1),('hat-marx',1),('hat-xi',16)]:
  with urllib.request.urlopen(BASE+f'img/{id}/{pn:03}.png',timeout=30) as r:assert r.read(8)==b'\x89PNG\r\n\x1a\n'
 return report,books,manifest,banks
def main():
 p=argparse.ArgumentParser();p.add_argument('--wait-seconds',type=int,default=2400);args=p.parse_args();end=time.monotonic()+args.wait_seconds
 while True:
  try:report,books,manifest,banks=obtain();break
  except (OSError,KeyError,ValueError,AssertionError) as e:
   if time.monotonic()>=end:raise RuntimeError('Validated source not available; website unchanged') from e
   print('Waiting for validated source:',type(e).__name__,flush=True);time.sleep(20)
 def write(n,d):p=ROOT/'data'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
 index=json.loads((ROOT/'data/practice-index.json').read_text());ids={b['id'] for b in books};index['books']=[b for b in index['books'] if b['id'] not in ids]+books
 for b in index['books']:
  if b['id'] in report['reused']:b['studyStage']='second'
 index['total']=sum(b['count'] for b in index['books']);index['version']=126;write('practice-index.json',index)
 src=json.loads((ROOT/'data/practice-sources.json').read_text());write('practice-sources.json',[m for m in src if m['id'] not in ids]+manifest)
 for id,bank in banks.items():write('practice/'+id+'.json',bank)
 write('second-hat-report.json',report);print('Imported',report['matchingCount'],'new matching groups and',report['clozeCount'],'blue-answer cloze cards; 49 existing groups retained.',flush=True)
if __name__=='__main__':main()
