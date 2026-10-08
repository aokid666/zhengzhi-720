#!/usr/bin/env python3
"""Re-rank and rebuild manual clozes from native OCR word boxes.

The source extractor deliberately keeps more candidates. This pass selects only
complete, clueable exam facts and recomputes every rectangle from the printed
word boxes. It never edits or converts the page images.
"""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
load=lambda p:json.loads(Path(p).read_text())

def norm(s):return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s).lower()
def balanced(s):return all(s.count(a)==s.count(b) for a,b in [('“','”'),('（','）'),('《','》')])
TRIGGERS='定义|本质|实质|核心|根本|关键|前提|基础|保障|动力|目标|目的|任务|内容|特征|特点|属性|性质|地位|作用|意义|原则|要求|标准|依据|主体|客体|对象|形式|方式|途径|方法|路线|方针|主题|主线|标志|起点|落脚点|归宿|灵魂|精髓|首要|中心|重点|主旨|答案|关键词|关系|表现|原因|结果|唯一|领导阶级|主力军|领导力量|指导思想|决定力量|基本途径|主要矛盾|中心任务|总目标|源泉'
CLUE_NOUNS='本质|实质|核心|根本|关键|前提|基础|保障|动力|目标|目的|任务|特征|特点|属性|性质|地位|作用|意义|原则|标准|依据|主体|客体|对象|标志|起点|落脚点|归宿|灵魂|精髓|原因|源泉|领导阶级|主力军|领导力量|指导思想|决定力量|主要矛盾'
RELATIONS='是指|在于|表现为|体现为|意味着|标志着|取决于|来源于|产生于|形成于|分为|包括|包含|是'
SHORT_CONCEPTS={'新事物','旧事物','本质','现象','内容','形式','原因','结果','真理','价值','劳动','资本','商品','实践','认识','自由','发展','否定','肯定','运动','静止','意识','物质'}
FILLER={'作为','相对的','绝对的','无条件的','有条件的','必然性','偶然性','假象','首要任务','科学性','人民性','实践性','发展性','社会的性质'}
BAD_EDGE=re.compile(r'^(?:的|和|与|及|为|是|把|将|对|在|从|由|使|其|这|它|一个|一种|因而|所以|但是|而且|同时)|(?:的|了|着|等|方面|问题|之一|仍然|也|而|则|就|都|并|却|又|还|不|未|虽然|但是|由于|因为|可以|应该|能够|不会|不能|不是)$')
HEAD=re.compile(r'^(?:第[一二三四五六七八九十\d]+(?:章|节|部分)|专题[一二三四五六七八九十]+|目录|考查频率|命题分析|郑重声明|干扰项\s*\d+)')

def ocr_page(pid,upper,lower):
 return load((upper if pid[0]=='u' else lower)/f'{int(pid[1:]):03}.json')

def span(line,start,end):
 """Return an exact padded box for a raw-text range, or None."""
 words=line.get('words') or []
 text=''.join(w['t'] for w in words)
 if not words or start<0 or end<=start or end>len(text):return None
 pos=0;chosen=[]
 for w in words:
  nxt=pos+len(w['t'])
  if nxt>start and pos<end:chosen.append(w)
  pos=nxt
 if not chosen:return None
 x=min(w['b'][0] for w in chosen);y=min(w['b'][1] for w in chosen)
 r=max(w['b'][0]+w['b'][2] for w in chosen);b=max(w['b'][1]+w['b'][3] for w in chosen)
 # OCR boxes hug glyphs tightly. A small symmetric pad covers antialiasing and
 # border width while keeping the rectangle on its printed line.
 return [max(0,x-2),max(0,y-2),r-x+4,b-y+4]

def useful(text,context=False):
 if not balanced(text) or re.search(r'可以是|可能是|也可以|既可以|命题特点|考查频率|本专题|高频考点|分析题|选择题|^说[：:]|^(?:因为|由于|所以|但是|可见|由此)',text):return False
 t=text.strip(' ，,。；;：:（）()“”')
 n=norm(t)
 if len(n)<4 and not (context and text.strip(' ，,。；;：:（）()“”') in SHORT_CONCEPTS):return False
 if not 2<=len(n)<=20:return False
 if not balanced(t) or BAD_EDGE.search(t):return False
 if n in {norm(x) for x in FILLER} and not context:return False
 if re.fullmatch(r'[\d年月日届次第上下左右前后]+',n):return False
 return True

def add(cands,line,li,start,end,text,score,reason,qids=(),source='relation'):
 text=text.strip(' ，,。；;：:')
 while start<end and line['raw'][start] in ' ，,。；;：:':start+=1
 while end>start and line['raw'][end-1] in ' ，,。；;：:':end-=1
 if not useful(text,source=='relation'):return
 box=span(line,start,end)
 if not box:return
 cands.append({'id':f'v115-{pid}-{li}-{start}','b':box,'text':line['raw'][start:end],
  'reason':reason,'questionIds':sorted(set(qids))[:3],'score':round(score,1),'line':li,'source':source})

def relation_candidates(lines):
 out=[]
 for li,line in enumerate(lines):
  raw=''.join(w['t'] for w in line.get('words',[]));line=dict(line,raw=raw);lines[li]=line
  if not raw or line['b'][1]<165 or line['b'][3]>40 or HEAD.search(raw):continue
  def complete(end):return end<len(raw) or bool(re.search(r'[。；;）)]$',raw))
  prev=lines[li-1]['raw'] if li else ''
  continued=bool(prev and not re.search(r'[。！？；;）)]$',prev) and lines[li-1]['b'][0]+lines[li-1]['b'][2]>800 and line['b'][1]-lines[li-1]['b'][1]<65 and line['b'][0]<220)
  if re.search(r'(?:^|[^A-Za-z])[AB](?:[^A-Za-z]|$)',raw):continue
  # Printed “关键词” lists are intentional recall prompts.
  for m in re.finditer(r'关键词[：:]\s*([^（）()。；;]{3,28})',raw):
   a,b=m.span(1);
   if complete(b):add(out,line,li,a,b,m[1],42,'结构考点',source='relation')
  # Labels such as “唯一特性：客观实在性” provide a clear clue.
  for colon in re.finditer(r'[：:]',raw):
   before=raw[max(0,colon.start()-18):colon.start()]
   if not re.search(TRIGGERS,before):continue
   a=colon.end();tail=raw[a:]
   stop=re.search(r'[，,。；;（(]',tail);b=a+(stop.start() if stop else len(tail))
   if b-a>22:
    short=re.search(r'(?:并|而|且|以及)',raw[a:b]);
    if not short:continue
    b=a+short.start()
   val=raw[a:b]
   pref=re.match(r'(?:第一|第二|第三|第四)种是',val)
   if pref:a+=pref.end();val=raw[a:b]
   if complete(b):add(out,line,li,a,b,val,46,'结构考点',source='relation')
  # Classification and definition predicates remain answerable from the visible subject.
  for m in re.finditer(r'('+RELATIONS+r')([^，,。；;（）()]{3,28})',raw):
   a,b=m.span(2);ans=m[2]
   if not complete(b):continue
   if m[1]=='是' and raw[max(0,m.start()-2):m.start()] in ('可以','总是','只是','也是','都是','不是','可能','不但','并非','并不','未必'):continue
   # When the predicate is itself a clue (X is the source/basis/mark), hide X.
   cut=max([raw.rfind(c,0,m.start()) for c in '。；;，,：:']+[-1])+1
   before=raw[cut:m.start()].lstrip('①②③④⑤⑥⑦⑧⑨⑩（()）0123456789.、 ')
   if not (continued and cut==0) and m[1] in ('是','是指') and (m[1]=='是指' or re.search(CLUE_NOUNS,ans)) and useful(before,True):
    sa=cut+raw[cut:m.start()].find(before);add(out,line,li,sa,sa+len(before),before,50,'结构考点',source='relation');continue
   if m[1]=='是' and not re.search(TRIGGERS,raw[max(0,m.start()-20):m.start()]):
    # Plain copulas are accepted only for compact, recognizable terms/lists.
    if len(norm(ans))>18 or not re.search(r'[、与和]|主义|制度|道路|理论|思想|规律|阶段|阶级|社会|国家|人民|价值|安全|发展',ans):continue
   if re.match(r'^(?:第一|第二|第三|第四)种是',ans):
    skip=ans.index('是')+1;a+=skip;ans=ans[skip:]
   add(out,line,li,a,b,ans,38,'结构考点',source='relation')
  for m in re.finditer(r'以([^，,。；;（）()]{4,24})为(?:核心|根本|基础|主体|目标|导向|重点|主线|原则)',raw):
   a,b=m.span(1);
   if complete(b):add(out,line,li,a,b,m[1],40,'结构考点',source='relation')
 return out

def old_candidates(page,lines):
 out=[]
 for old in page.get('maskCandidates',[]):
  li=old.get('line',-1)
  if not 0<=li<len(lines):continue
  line=lines[li];raw=line['raw'];needle=old['text'];start=raw.find(needle)
  if start<0:
   # Keep a valid old coordinate only when OCR punctuation differs; it is still
   # revalidated against the same printed line below.
   start=0
   best=None
   for i,w in enumerate(line.get('words',[])):
    x,y,ww,hh=old['b'];wx,wy,wid,hei=w['b']
    if abs(wy-y)<6 and wx+wid>x and wx<x+ww:best=i;break
   if best is None:continue
   prefix=''.join(w['t'] for w in line['words'][:best]);start=len(prefix)
  end=start+len(needle)
  if end>=len(raw) and not re.search(r'[。；;）)]$',raw):continue
  before=raw[max(0,start-22):start];after=raw[end:end+22]
  clue=bool(re.search(TRIGGERS+r'|'+RELATIONS,before+after))
  qids=old.get('questionIds') or []
  text=raw[start:end]
  if not useful(text,clue):continue
  score=(18 if qids else 5)+min(14,len(norm(text))*.8)+(18 if clue else 0)
  if norm(text) in {norm(x) for x in FILLER}:score-=30
  if len(norm(text))<=3:score-=15
  if score<18:continue
  add(out,line,li,start,end,text,score,'题目考查' if qids else '概念辨析',qids,source='question' if qids else 'term')
 return out

def overlaps(a,b):
 ax,ay,aw,ah=a['b'];bx,by,bw,bh=b['b']
 return ax<bx+bw and ax+aw>bx and ay<by+bh and ay+ah>by

def choose(cands,limit=None,bounds=None):
 if bounds:
  x,y,w,h=bounds
  cands=[c for c in cands if x<=c['b'][0]+c['b'][2]/2<=x+w and y<=c['b'][1]+c['b'][3]/2<=y+h]
 cands=sorted(cands,key=lambda c:(-c['score'],-len(norm(c['text'])),c['b'][1],c['b'][0]))
 picked=[];texts=set();lines=set()
 for c in cands:
  n=norm(c['text'])
  if any(n in t or t in n for t in texts) or c['line'] in lines or any(overlaps(c,d) for d in picked):continue
  picked.append(c);texts.add(n);lines.add(c['line'])
  if limit and len(picked)>=limit:break
 return picked

ap=argparse.ArgumentParser();ap.add_argument('--upper',type=Path,default=ROOT.parent/'manual-upper'/'pages');ap.add_argument('--lower',type=Path,default=ROOT.parent/'manual-lower'/'pages');args=ap.parse_args()
index=load(DATA/'manual-index.json');study=load(DATA/'manual-study.json')
all_by={}
for page in index['pages']:
 pid=page['id'];lines=ocr_page(pid,args.upper,args.lower)['lines']
 for line in lines:line['raw']=''.join(w['t'] for w in line.get('words',[]))
 eligible=(pid[0]=='u' and 9<=int(pid[1:])<=237) or (pid[0]=='l' and (8<=int(pid[1:])<=16 or 66<=int(pid[1:])<=166))
 if not eligible:
  page['maskCandidates']=page['masks']=[];page['maskSets']={'core':[],'exam':[],'more':[]};continue
 rel=relation_candidates(lines);old=old_candidates(page,lines);pool=rel+old;all_by[pid]=pool
 selected=choose(pool)
 page['maskCandidates']=selected
 page['maskSets']={'core':selected[:1],'exam':selected[:3],'more':selected[:6]}
 page['masks']=page['maskSets']['exam']
for block in study['blocks']:
 block['masksByPage']={}
 for ref in block['refs']:
  pid=ref['page'];block['masksByPage'][pid]=choose(all_by.get(pid,[]),6,ref['b'])
index['version']=115;index['studyVersion']=115;study['version']=115
(DATA/'manual-index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n')
(DATA/'manual-study.json').write_text(json.dumps(study,ensure_ascii=False,separators=(',',':'))+'\n')
allm=[m for p in index['pages'] for m in p['maskCandidates']]
default=[m for p in index['pages'] for m in p['masks']]
blockm=[m for b in study['blocks'] for ms in b['masksByPage'].values() for m in ms]
print(json.dumps({'candidates':len(allm),'defaults':len(default),'blockMasks':len(blockm),'questionBased':sum(bool(m['questionIds']) for m in default),'relationBased':sum(m.get('source')=='relation' for m in default),'pagesWithCloze':sum(bool(p['masks']) for p in index['pages'])},ensure_ascii=False))
