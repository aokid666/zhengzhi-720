#!/usr/bin/env python3
"""Build conservative, exam-oriented clozes from native OCR word boxes.

The default plan is deliberately sparse. A span must either be traceable to a
correct option in the site's question bank or sit in a sentence with a strong
exam signal (scope, condition, priority, definition, distinction, sequence).
Every recommendation also gets an answer-free recall cue. Page images are never
edited or converted.
"""
from __future__ import annotations
import argparse,collections,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
VERSION=116
load=lambda p:json.loads(Path(p).read_text())

def norm(s):return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s).lower()
def balanced(s):return all(s.count(a)==s.count(b) for a,b in [('“','”'),('（','）'),('《','》')])

TRIGGERS='定义|本质|实质|核心|根本|关键|前提|基础|保障|动力|目标|目的|任务|内容|特征|特点|属性|性质|地位|作用|意义|原则|要求|标准|依据|主体|客体|对象|形式|方式|途径|方法|路线|方针|主题|主线|标志|起点|落脚点|归宿|灵魂|精髓|首要|中心|重点|主旨|关系|表现|原因|结果|唯一|领导阶级|主力军|领导力量|指导思想|决定力量|基本途径|主要矛盾|中心任务|总目标|源泉'
CLUE_NOUNS='本质|实质|核心|根本|关键|前提|基础|保障|动力|目标|目的|任务|特征|特点|属性|性质|地位|作用|意义|原则|标准|依据|主体|客体|对象|标志|起点|落脚点|归宿|灵魂|精髓|原因|源泉|领导阶级|主力军|领导力量|指导思想|决定力量|主要矛盾'
RELATIONS='是指|在于|表现为|体现为|意味着|标志着|取决于|来源于|产生于|形成于|决定于|决定|分为|包括|包含|由.+?组成|是'
SHORT_CONCEPTS={'新事物','旧事物','本质','现象','内容','形式','原因','结果','真理','价值','劳动','资本','商品','实践','认识','自由','发展','否定','肯定','运动','静止','意识','物质'}
FILLER={'作为','相对的','绝对的','无条件的','有条件的','必然性','偶然性','假象','首要任务','科学性','人民性','实践性','发展性','社会的性质'}
BAD_EDGE=re.compile(r'^(?:性的|作用的是|但|着|了|的|和|与|及|为|是|把|将|对|在|从|由|使|其|这|它|一个|一种|因而|所以|但是|而且|同时)|(?:特别|只|的|了|着|等|方面|问题|之一|仍然|也|而|则|就|都|并|却|又|还|不|未|虽然|但是|由于|因为|可以|应该|能够|不会|不能|不是)$')
HEAD=re.compile(r'^(?:第[一二三四五六七八九十\d]+(?:章|节|部分)|专题[一二三四五六七八九十]+|目录|考查频率|命题分析|郑重声明|干扰项\s*\d+)')
BAD_LINE=re.compile(r'命题特点|考查频率|经典干扰项|[（(][×xX][）)]|[×✕]|错误说法')

SIGNALS=[
 ('唯一/极值',r'唯一|最(?:根本|终|高|低|主要|基本|重要)|第一|首要|决定性'),
 ('条件/边界',r'只有|才|只要|必须|不能|不得|并非|不是|不等于|区别|前提|条件|范围|限于'),
 ('地位/作用',r'根本|核心|本质|实质|基础|保障|动力|关键|主体|主导|主线|灵魂|精髓'),
 ('时间/标志',r'标志|起点|开端|转折|完成|形成|确立|开始|首次|第一次'),
 ('组成/对应',r'包括|包含|分为|组成|分别|二者|三者|一方面|另一方面|既.+又|与.+相'),
 ('因果/关系',r'决定|取决|来源|产生|导致|制约|反作用|原因|结果|依据'),
 ('定义/特征',r'是指|定义|特征|特点|属性|性质|表现为|体现为|意味着'),
]

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
 return [max(0,x-2),max(0,y-2),r-x+4,b-y+4]

def useful(text,context=False):
 if not balanced(text) or re.search(r'可以是|可能是|也可以|既可以|命题特点|考查频率|本专题|高频考点|分析题|选择题|^说[：:]|^(?:因为|由于|所以|但是|可见|由此)',text):return False
 t=text.strip(' ，,。；;：:（）()“”');n=norm(t)
 if len(n)<4 and not (context and t in SHORT_CONCEPTS):return False
 if not 2<=len(n)<=24 or not balanced(t) or BAD_EDGE.search(t):return False
 if n in {norm(x) for x in FILLER} and not context:return False
 if re.fullmatch(r'[\d年月日届次第上下左右前后]+',n):return False
 return True

def add(cands,line,li,start,end,text,score,reason,qids=(),source='relation'):
 while start<end and line['raw'][start] in ' ，,。；;：:':start+=1
 while end>start and line['raw'][end-1] in ' ，,。；;：:':end-=1
 text=line['raw'][start:end]
 prefix=re.match(r'\d+个因素[：:]\s*',text)
 if prefix:start+=prefix.end();text=line['raw'][start:end]
 if not useful(text,source=='relation'):return
 box=span(line,start,end)
 if not box:return
 cands.append({'id':f'v{VERSION}-{pid}-{li}-{start}','b':box,'text':text,
  'reason':reason,'questionIds':sorted(set(qids))[:8],'score':round(score,1),
  'line':li,'source':source,'_start':start,'_end':end})

def relation_candidates(lines):
 out=[]
 for li,line in enumerate(lines):
  raw=line['raw']
  if not raw or line['b'][1]<165 or line['b'][3]>40 or HEAD.search(raw) or BAD_LINE.search(raw):continue
  def complete(end):return end<len(raw) or bool(re.search(r'[。；;）)]$',raw))
  prev=lines[li-1]['raw'] if li else ''
  continued=bool(prev and not re.search(r'[。！？；;）)]$',prev) and lines[li-1]['b'][0]+lines[li-1]['b'][2]>800 and line['b'][1]-lines[li-1]['b'][1]<65 and line['b'][0]<220)
  if re.search(r'(?:^|[^A-Za-z])[AB](?:[^A-Za-z]|$)',raw):continue
  for m in re.finditer(r'关键词[：:]\s*([^（）()。；;]{3,28})',raw):
   a,b=m.span(1)
   if complete(b):add(out,line,li,a,b,m[1],62,'结构考点')
  for colon in re.finditer(r'[：:]',raw):
   before=raw[max(0,colon.start()-20):colon.start()]
   if not re.search(TRIGGERS,before):continue
   a=colon.end();tail=raw[a:];stop=re.search(r'[，,。；;（(]',tail);b=a+(stop.start() if stop else len(tail))
   if b-a>24:
    short=re.search(r'(?:并|而|且|以及)',raw[a:b])
    if not short:continue
    b=a+short.start()
   val=raw[a:b];pref=re.match(r'(?:第一|第二|第三|第四)种是',val)
   if pref:a+=pref.end();val=raw[a:b]
   if complete(b):add(out,line,li,a,b,val,72,'结构考点')
  for m in re.finditer(r'('+RELATIONS+r')([^，,。；;（）()]{3,28})',raw):
   a,b=m.span(2);ans=m[2]
   if not complete(b):continue
   if m[1]=='是' and raw[max(0,m.start()-2):m.start()] in ('可以','总是','只是','也是','都是','不是','可能','不但','并非','并不','未必'):continue
   cut=max([raw.rfind(c,0,m.start()) for c in '。；;，,：:']+[-1])+1
   before=raw[cut:m.start()].lstrip('①②③④⑤⑥⑦⑧⑨⑩（()）0123456789.、 ')
   if not (continued and cut==0) and m[1] in ('是','是指') and (m[1]=='是指' or re.search(CLUE_NOUNS,ans)) and useful(before,True):
    sa=cut+raw[cut:m.start()].find(before);add(out,line,li,sa,sa+len(before),before,74,'结构考点');continue
   if m[1]=='是' and not re.search(TRIGGERS,raw[max(0,m.start()-22):m.start()]):
    if len(norm(ans))>18 or not re.search(r'[、与和]|主义|制度|道路|理论|思想|规律|阶段|阶级|社会|国家|人民|价值|安全|发展',ans):continue
   if re.match(r'^(?:第一|第二|第三|第四)种是',ans):
    skip=ans.index('是')+1;a+=skip;ans=ans[skip:]
   add(out,line,li,a,b,ans,58,'结构考点')
  for m in re.finditer(r'以([^，,。；;（）()]{4,24})为(?:核心|根本|基础|主体|目标|导向|重点|主线|原则)',raw):
   a,b=m.span(1)
   if complete(b):add(out,line,li,a,b,m[1],76,'结构考点')
 return out

def option_terms(text):
 """Yield exact answer fragments that are useful when found in explanatory prose."""
 text=re.sub(r'^[A-D][.、．:]\s*','',text).strip();seeds={text}
 seeds.update(x.strip() for x in re.split(r'[，,；;。]',text))
 for x in list(seeds):
  for m in re.finditer(r'(?:是指|表现为|体现为|意味着|标志着|取决于|来源于|决定于|包括|包含|分为|是|为)([^，,；;。]{2,28})',x):seeds.add(m[1].strip())
  for prefix in ('必须坚持','坚持','要坚持','应当坚持','根本在于','关键在于','核心是','本质是','实质是'):
   if x.startswith(prefix):seeds.add(x[len(prefix):].strip())
 out=set()
 for x in seeds:
  x=x.strip('“”‘’（）() ：:');n=norm(x)
  if 3<=len(n)<=24 and useful(x,True) and not re.search(r'^(?:正确|错误|以上|材料|题干)',x):out.add(n)
 return out

def build_question_terms():
 terms=collections.defaultdict(set)
 for name in ['questions.json','topical-exercises.json','manual-questions.json']:
  for q in load(DATA/name):
   for key in str(q.get('answer','')):
    value=(q.get('options') or {}).get(key)
    if not value:continue
    for term in option_terms(value):terms[term].add(q['id'])
 return terms

def question_candidates(lines,terms):
 out=[];by_prefix=collections.defaultdict(list)
 for term,qids in terms.items():by_prefix[term[:2]].append((term,qids))
 for li,line in enumerate(lines):
  raw=line['raw']
  if not raw or line['b'][1]<165 or line['b'][3]>40 or HEAD.search(raw) or BAD_LINE.search(raw):continue
  chars=[];mapping=[]
  for ri,ch in enumerate(raw):
   for c in norm(ch):chars.append(c);mapping.append(ri)
  flat=''.join(chars);seen=set();prefixes={flat[i:i+2] for i in range(max(0,len(flat)-1))}
  for pre in prefixes:
   for term,qids in by_prefix.get(pre,[]):
    start=flat.find(term)
    if start<0 or term in seen:continue
    seen.add(term);a=mapping[start];b=mapping[start+len(term)-1]+1
    if len(term)>len(flat)*.72 and line['b'][2]>650:continue
    add(out,line,li,a,b,raw[a:b],88+min(12,len(qids)*2),'题库同源',qids,'question')
 return out

def old_candidates(page,lines):
 """Retain only potentially useful legacy terms; final grading is stricter."""
 out=[]
 for old in page.get('maskCandidates',[]):
  li=old.get('line',-1)
  if not 0<=li<len(lines):continue
  line=lines[li];raw=line['raw'];needle=old['text'];start=raw.find(needle)
  if start<0 or BAD_LINE.search(raw):continue
  end=start+len(needle);before=raw[max(0,start-24):start];after=raw[end:end+24]
  clue=bool(re.search(TRIGGERS+r'|'+RELATIONS,before+after));qids=old.get('questionIds') or []
  if not useful(needle,clue):continue
  score=(70 if qids else 36)+(12 if clue else 0)+min(10,len(norm(needle))/2)
  add(out,line,li,start,end,needle,score,'题库同源' if qids else '概念辨析',qids,'question' if qids else 'term')
 return out

def exam_tag(raw):
 for label,pattern in SIGNALS:
  if re.search(pattern,raw):return label
 return ''

def cue(lines,line_no,start,end,tag):
 raw=lines[line_no]['raw'];masked=raw[:start]+'____'+raw[end:]
 # OCR often wraps one printed sentence across two lines. Short neighboring
 # fragments restore the clue without revealing the covered answer.
 if len(masked)<42 and line_no:
  prev=lines[line_no-1]['raw']
  if prev and not HEAD.search(prev) and not BAD_LINE.search(prev):masked=prev[-24:]+masked
 if len(masked)<58 and line_no+1<len(lines):
  nxt=lines[line_no+1]['raw']
  if nxt and not HEAD.search(nxt) and not BAD_LINE.search(nxt):masked+=nxt[:24]
 masked=re.sub(r'^\s*[①②③④⑤⑥⑦⑧⑨⑩\d.、）)]+\s*','',masked).strip();pos=masked.find('____')
 if len(masked)>72:
  left=max(0,pos-27);right=min(len(masked),pos+4+37)
  masked=('…' if left else '')+masked[left:right]+('…' if right<len(masked) else '')
 return (tag or '题库同源')+'｜'+masked

def grade(c,lines):
 raw=lines[c['line']]['raw'];visible=raw[:c['_start']]+raw[c['_end']:]
 tag=exam_tag(visible);qids=c.get('questionIds') or [];n=len(norm(c['text']))
 if qids:
  score=96+min(12,len(qids)*3)+(12 if tag else 0)+(6 if n>=6 else 0)
  if n<=4 and not tag:score=64
  c['source']='question';c['reason']='题库同源'
 elif tag:
  score=82+(8 if c['source']=='relation' else 0)+(5 if n>=6 else 0)
  c['reason']='限定词辨析' if tag in ('唯一/极值','条件/边界') else '结构考点'
 else:
  score=60 if c['source']=='relation' and c['score']>=70 else 0
 if norm(c['text']) in {norm(x) for x in FILLER}:score=0
 c['score']=score;c['examTag']=tag or ('题库同源' if qids else '定义/关系')
 c['examPrompt']=cue(lines,c['line'],c['_start'],c['_end'],c['examTag']);c['questionCount']=len(qids)
 return score>=78

def merge(cands):
 groups={}
 for c in cands:
  k=(c['line'],norm(c['text']))
  if k not in groups:groups[k]=c;continue
  old=groups[k];old['questionIds']=sorted(set(old.get('questionIds',[])+c.get('questionIds',[])))[:8]
  if c['source']=='question':old['source']='question'
  old['score']=max(old['score'],c['score'])
 return list(groups.values())

def overlaps(a,b):
 ax,ay,aw,ah=a['b'];bx,by,bw,bh=b['b']
 return ax<bx+bw and ax+aw>bx and ay<by+bh and ay+ah>by

def choose(cands,limit=None,bounds=None):
 if bounds:
  x,y,w,h=bounds
  cands=[c for c in cands if x<=c['b'][0]+c['b'][2]/2<=x+w and y<=c['b'][1]+c['b'][3]/2<=y+h]
 cands=sorted(cands,key=lambda c:(-c['score'],-len(c.get('questionIds',[])),-len(norm(c['text'])),c['b'][1],c['b'][0]))
 picked=[];texts=set();lines=set()
 for c in cands:
  n=norm(c['text'])
  if any(n in t or t in n for t in texts) or c['line'] in lines or any(overlaps(c,d) for d in picked):continue
  clean={k:v for k,v in c.items() if not k.startswith('_')}
  picked.append(clean);texts.add(n);lines.add(c['line'])
  if limit and len(picked)>=limit:break
 return picked

ap=argparse.ArgumentParser();ap.add_argument('--upper',type=Path,default=ROOT.parent/'manual-upper'/'pages');ap.add_argument('--lower',type=Path,default=ROOT.parent/'manual-lower'/'pages');args=ap.parse_args()
index=load(DATA/'manual-index.json');study=load(DATA/'manual-study.json');question_terms=build_question_terms();all_by={}
for page in index['pages']:
 pid=page['id'];lines=ocr_page(pid,args.upper,args.lower)['lines']
 for line in lines:line['raw']=''.join(w['t'] for w in line.get('words',[]))
 eligible=(pid[0]=='u' and 9<=int(pid[1:])<=237) or (pid[0]=='l' and (8<=int(pid[1:])<=16 or 66<=int(pid[1:])<=166))
 if not eligible:
  page['maskCandidates']=page['masks']=[];page['maskSets']={'core':[],'exam':[],'more':[]};continue
 pool=merge(question_candidates(lines,question_terms)+relation_candidates(lines)+old_candidates(page,lines))
 pool=[c for c in pool if grade(c,lines)];all_by[pid]=pool;selected=choose(pool)
 page['maskCandidates']=selected;page['maskSets']={'core':selected[:1],'exam':selected[:3],'more':selected[:6]};page['masks']=page['maskSets']['exam']
for block in study['blocks']:
 block['masksByPage']={}
 for ref in block['refs']:
  pid=ref['page'];block['masksByPage'][pid]=choose(all_by.get(pid,[]),6,ref['b'])
index['version']=VERSION;index['studyVersion']=VERSION;study['version']=VERSION
(DATA/'manual-index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n')
(DATA/'manual-study.json').write_text(json.dumps(study,ensure_ascii=False,separators=(',',':'))+'\n')
allm=[m for p in index['pages'] for m in p['maskCandidates']];default=[m for p in index['pages'] for m in p['masks']]
blockm=[m for b in study['blocks'] for ms in b['masksByPage'].values() for m in ms]
print(json.dumps({'version':VERSION,'questionTerms':len(question_terms),'candidates':len(allm),'defaults':len(default),'blockMasks':len(blockm),'questionBased':sum(bool(m['questionIds']) for m in default),'signalBased':sum(bool(m.get('examTag')) for m in default),'pagesWithCloze':sum(bool(p['masks']) for p in index['pages'])},ensure_ascii=False))
