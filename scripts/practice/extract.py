import fitz,json,urllib.request,urllib.parse,hashlib,concurrent.futures
from pathlib import Path
W=Path(__file__).resolve().parents[2]/'.practice-build'
(W/'pdfs').mkdir(parents=True,exist_ok=True);(W/'text').mkdir(exist_ok=True)
books=[('cf-upper','27乘风肖1000题笔记 上册（马原·思修）','27乘风肖1000题笔记上册—马原思修.pdf'),('cf-lower','27乘风1000题笔记 下册（史纲·毛中特·新思想）','27乘风1000题笔记下册—史纲毛中特新思想.pdf'),('leg-round','一轮腿姐学成选择合集','一轮腿姐学成选择合集.pdf'),('leg-marx','腿姐马原学成选择题合集','腿姐马原学成选择题合集.pdf'),('xu-marx','徐涛马原学成选择题合集','徐涛马原学成选择题合集.pdf'),('xu-ethics','徐涛思修学成选择合集','徐涛思修学成选择合集.pdf'),('xu-history','徐史纲学成选择题合集','徐史纲学成选择题合集.pdf'),('history-second','二刷史纲学成选择题合集','二刷史纲学成选择题合集.pdf'),('ethics-match','思修学成连线题','思修学成连线题.pdf'),('xu-daily','第一批一轮徐涛马原每日任务合集','第一批一轮徐涛马原每日任务合集.pdf')]
def run(b):
 id,title,name=b;url='https://aokid666.github.io/zz-pdf/pdf/'+urllib.parse.quote(name);f=W/'pdfs'/f'{id}.pdf'
 if not f.exists():f.write_bytes(urllib.request.urlopen(url,timeout=60).read())
 d=fitz.open(f);pages=[]
 for n,p in enumerate(d):
  lines=[]
  for block in p.get_text('dict')['blocks']:
   for l in block.get('lines',[]):
    sp=l['spans'];t=''.join(s['text'] for s in sp).strip()
    if t:lines.append({'t':t,'b':list(l['bbox']),'spans':[{'text':s['text'],'font':s['font'],'size':s['size'],'color':s['color'],'bbox':list(s['bbox'])} for s in sp]})
  lines.sort(key=lambda l:(round(l['b'][1],1),l['b'][0]));pages.append({'page':n+1,'width':p.rect.width,'height':p.rect.height,'lines':lines,'text':p.get_text()})
 (W/'text'/f'{id}-layout.json').write_text(json.dumps(pages,ensure_ascii=False))
 print(id,len(pages),flush=True)
 return {'id':id,'title':title,'url':url,'file':name,'pages':len(pages),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:res=list(ex.map(run,books))
(W/'sources.json').write_text(json.dumps(res,ensure_ascii=False))
