"""Import only validated, deployed Actions output; never parse PDF in a visitor's browser."""
import argparse,concurrent.futures,json,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE='https://aokid666.github.io/zz-dalizi-2027/';ID='dalizi-true';SHA='4a5cc6fe7c24379391dfd3a0e968c0569e4a0cb470a906e0af3de1552205bae3'
def fetch(name):
 req=urllib.request.Request(BASE+'data/'+name+'?verify='+str(time.time_ns()),headers={'User-Agent':'dalizi-import'})
 with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
def obtain():
 names=['book.json','dalizi-true.json','source-manifest.json','build-report.json']
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:book,bank,manifest,report=list(ex.map(fetch,names))
 assert book['sha256']==manifest['pdfSha256']==report['pdfSha256']==SHA
 assert book['id']==bank['bookId']==ID and book['count']==len(bank['questions'])==363
 assert len(bank['pages'])==len(manifest['pages'])==report['imageCount']==280
 assert len(book['readSections'])==15 and report['single']==176 and report['multiple']==187
 assert all(p['ext']=='png' and p['bytes']>0 and len(p['sha256'])==64 for p in manifest['pages'])
 # Confirm that the actual image host is serving generated pages, not just metadata.
 for pn in [1,45,52,270,280]:
  req=urllib.request.Request(BASE+f'img/{ID}/{pn:03}.png',headers={'Range':'bytes=0-7','User-Agent':'dalizi-import'})
  with urllib.request.urlopen(req,timeout=30) as r:assert r.read(8)==b'\x89PNG\r\n\x1a\n'
 return book,bank,manifest,report

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--wait-seconds',type=int,default=0);a=parser.parse_args();end=time.monotonic()+a.wait_seconds
 while True:
  try:book,bank,manifest,report=obtain();break
  except (OSError,ValueError,KeyError,AssertionError) as error:
   if time.monotonic()>=end:raise RuntimeError('Validated Dalizi assets are not yet deployed; existing website remains unchanged.') from error
   print('Waiting for validated GitHub asset deployment:',type(error).__name__,flush=True);time.sleep(min(20,max(0,end-time.monotonic())))
 p=ROOT/'data/practice-index.json';index=json.loads(p.read_text());index['books']=[b for b in index['books'] if b['id']!=ID]+[book];index['version']=121;index['total']=sum(b['count'] for b in index['books'])
 assert index['total']==1752,'Existing bank changed; review totals before merging.'
 p=ROOT/'data/practice-sources.json';sources=json.loads(p.read_text());sources=[s for s in sources if s['id']!=ID]+[manifest]
 write(ROOT/'data/practice-index.json',index);write(ROOT/f'data/practice/{ID}.json',bank);write(p,sources);write(ROOT/'data/dalizi-build-report.json',report)
 print('Imported 363 validated questions and 280 original PNG references.',flush=True)
if __name__=='__main__':main()
