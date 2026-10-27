"""Import only validated GitHub Actions output; no PDF work on the visitor's device."""
import argparse,concurrent.futures,hashlib,json,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE='https://aokid666.github.io/zz-mipeng-2027/'
def fetch(name):
 with urllib.request.urlopen(BASE+'data/'+name+'?verify='+str(time.time_ns()),timeout=40) as r:return json.load(r)
def obtain():
 with concurrent.futures.ThreadPoolExecutor() as ex:book,bank,manifest,report=list(ex.map(fetch,['book.json','mipeng6.json','source-manifest.json','build-report.json']))
 assert book['id']==bank['bookId']==manifest['id']=='mipeng6'
 assert book['count']==len(bank['questions'])==report['questionCount']==228
 assert book['sha256']==manifest['pdfSha256']==report['pdfSha256']
 assert len(manifest['pages'])==len(bank['pages'])==182 and not report['errors']
 assert report['single']==96 and report['multiple']==102 and report['written']==30
 assert all(len([q for q in bank['questions'] if q['examSet']==s])==38 for s in range(1,7))
 assert all(p['ext']=='png' and p['bytes']>0 and len(p['sha256'])==64 for p in manifest['pages'])
 for pn in [7,73,94,182]:
  with urllib.request.urlopen(BASE+f'img/mipeng6/{pn:03}.png?verify='+str(time.time_ns()),timeout=30) as r:assert r.read(8)==b'\x89PNG\r\n\x1a\n'
 return book,bank,manifest,report

def main():
 p=argparse.ArgumentParser();p.add_argument('--wait-seconds',type=int,default=1800);a=p.parse_args();end=time.monotonic()+a.wait_seconds
 while True:
  try:book,bank,manifest,report=obtain();break
  except (OSError,ValueError,KeyError,AssertionError) as e:
   if time.monotonic()>=end:raise RuntimeError('Validated source is not deployed; existing website remains unchanged') from e
   print('Waiting for validated GitHub source deployment',type(e).__name__,flush=True);time.sleep(20)
 def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
 path=ROOT/'data/practice-index.json';index=json.loads(path.read_text());index['books']=[b for b in index['books'] if b['id']!='mipeng6']+[book];index['total']=sum(b['count'] for b in index['books']);index['version']=125
 write(path,index);write(ROOT/'data/practice/mipeng6.json',bank)
 path=ROOT/'data/practice-sources.json';sources=json.loads(path.read_text());write(path,[s for s in sources if s['id']!='mipeng6']+[manifest]);write(ROOT/'data/mipeng-build-report.json',report)
 print('Validated and imported 198 choices + 30 written exercises with 182 original scans.',flush=True)
if __name__=='__main__':main()
