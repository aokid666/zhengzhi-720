"""Build source-bounded study cards and evidence-based clozes from native pages.

Run from the parent workspace containing manual-upper, manual-lower and manual-source.
Images are read only; the web UI clips the original image without creating new files.
"""
import json,re,hashlib,collections
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import signal,ndimage as nd

ROOT=Path('manual-source'); DATA=ROOT/'data'
load=lambda p:json.loads(Path(p).read_text())
index=load(DATA/'manual-index.json'); pages=index['pages']; by={p['id']:p for p in pages}
raw={p['id']:load(('manual-upper' if p['vol']=='upper' else 'manual-lower')+f"/pages/{p['page']:03}.json") for p in pages}
blocks=[]; exercises=[]
def clean(s):return s.replace('深人','深入').replace('进人','进入').replace('步人','步入').replace('写人','写入').replace('惩前后','惩前毖后').replace('生理國限','生理局限').replace('中国4共产党','中国共产党').replace('进步入士','进步人士').replace('特色社会主义进新时代','特色社会主义进入新时代')
def module(pid,y=150):
 p=by[pid]; ts=[t for t in index['topics'] if pid in t['pages']]
 if not ts:return ('背诵手册','')
 t=ts[-1]
 for candidate in reversed(ts):
  if candidate['start']<p['page']:t=candidate;break
  ls=raw[pid]['lines']; heads=[l for l in ls if re.match(r'^专题[一二三四五六七八九十]+',l['t'])]
  n=re.search(r'^专题([一二三四五六七八九十]+)',candidate['title'])
  head=next((l for l in heads if n and l['t'].startswith('专题'+n[1])),None)
  if head and head['b'][1]-30<=y:t=candidate;break
 return (t['module'],t['title'])
def ref(pid,b,lines):return {'page':pid,'b':[round(float(v),1) for v in b],'lines':lines}
def add_block(kind,pid,b,ls,ident=None,mod=None):
 if not ls:return None
 mod,title=module(pid,b[1]) if mod is None else (mod,'')
 bid=ident or kind+'-'+pid+'-'+str(round(b[1]))
 obj={'id':bid,'kind':kind,'module':mod,'topic':title,'title':clean(''.join(l['t'] for l in ls if not re.search('命题分析|^点拨$',l['t'])))[:60], 'text':clean('\n'.join(l['t'] for l in ls)), 'refs':[ref(pid,b,ls)],'questionIds':[]}
 blocks.append(obj);return obj

# Detect the actual diagonal 点拨 icon, not all orange decoration on a page.
a=np.asarray(Image.open('manual-upper/img/013.png').convert('RGB'))
template=(np.min(a[177:239,95:150],axis=2)<140).astype(float)
def borders(a):
 r,g,b=[a[:,:,i].astype('int16') for i in range(3)]
 orange=(r>160)&(r-g>10)&(g-b>5)
 counts=orange[:,int(a.shape[1]*.10):int(a.shape[1]*.91)].sum(1)
 return [s[0].start for s in nd.find_objects(nd.label(counts>a.shape[1]*.42)[0]) if s[0].start>=160 and s[0].stop-s[0].start<=7]
def icons(a):
 ink=(np.min(a[:,75:190],axis=2)<140).astype(float)
 cor=signal.correlate(ink,template,mode='valid',method='fft')
 count=np.maximum(0,signal.correlate(ink,np.ones(template.shape),mode='valid',method='fft'))
 scores=cor/np.maximum(1,np.sqrt(count*template.sum()));scores[:160]=0
 found=[]
 while scores.max()>=.66:
  y,x=np.unravel_index(scores.argmax(),scores.shape);found.append((int(y),float(scores[y,x])));scores[max(0,y-50):y+50]=0
 return sorted(found)
pending=None
for p in pages:
 pid=p['id'];p['tags']=[]
 if p['vol']=='upper' and not 9<=p['page']<=237:continue
 if p['vol']=='lower' and not (8<=p['page']<=16 or 66<=p['page']<=166):continue
 arr=np.asarray(Image.open(('manual-upper' if p['vol']=='upper' else 'manual-lower')+f"/img/{p['page']:03}.png").convert('RGB'))
 rows=borders(arr); ls=raw[pid]['lines']; anchors=[('点拨',y,score) for y,score in icons(arr)]
 anchors += [('命题分析',l['b'][1],1) for l in ls if '命题分析' in l['t'] and l['b'][1]>160]
 first=rows[0] if rows else 9999
 if pending and pending['refs'][-1]['page'][0]==pid[0] and int(pending['refs'][-1]['page'][1:])+1==p['page'] and first<230 and not any(abs(y-first)<65 for _,y,_ in anchors):
  bottom=next((y for y in rows if y>first+65),None)
  content=[l for l in ls if first<=l['b'][1]+l['b'][3]/2<=(bottom or first)]
  if content and not any(re.match(r'^专题|^第[一二三四五六]部分',l['t']) for l in content):
   pending['refs'].append(ref(pid,[p['width']*.085,first-5,p['width']*.84,bottom-first+12],content));pending['text']+='\n'+clean('\n'.join(l['t'] for l in content))
 pending=None
 for kind,y,score in sorted(anchors,key=lambda v:v[1]):
  top=next((v for v in rows if y-8<=v<=y+38),None)
  if top is None:continue
  bottom=next((v for v in rows if v>top+55),None)
  if bottom is None:continue
  content=[l for l in ls if y-4<=l['b'][1]+l['b'][3]/2<=bottom+3 and len(l['t'])>1]
  obj=add_block(kind,pid,[p['width']*.085,y-6,p['width']*.84,bottom-y+15],content)
  if obj:
   obj['iconScore']=round(score,3)
   if bottom>p['height']*.86:pending=obj

# Lower-volume distractor units are delimited by their printed headings.
entries=[]
for n in range(82,95):
 for l in raw[f'l{n:03}']['lines']:
  if l['b'][1]>160:entries.append((f'l{n:03}',l))
anchors=[]; currentMod='马克思主义基本原理'
for i,(pid,l) in enumerate(entries):
 if re.match('^二、毛泽东',l['t']):currentMod='毛泽东思想和中国特色社会主义理论体系概论'
 if re.match('^三、中国近现代',l['t']):currentMod='中国近现代史纲要'
 m=re.match(r'^干扰项\s*(\d+)',l['t'])
 if m:
  start=i
  if i and entries[i-1][0]==pid and abs(entries[i-1][1]['b'][1]-l['b'][1])<22 and entries[i-1][1]['b'][0]>210:start=i-1
  anchors.append((start,i,int(m[1]),currentMod))
for k,(start,anchor,no,mod) in enumerate(anchors):
 end=anchors[k+1][0] if k+1<len(anchors) else len(entries)
 segment=entries[start:end]
 segment=[(pid,l) for pid,l in segment if not re.match(r'^[一二三]、(马克思主义|毛泽东|中国近现代)',l['t'])]
 stem=[]; analysis=[]; expansion=[]; state='stem'
 for pid,l in segment:
  t=l['t']
  header=re.match(r'^干扰项\s*\d+[)）]?\s*(.*)',t)
  if header:
   t=header[1]
   if not t:continue
   l=dict(l,t=t)
  if t.startswith('辨析'):state='analysis'
  if t.startswith('拓展'):state='expansion'
  {'stem':stem,'analysis':analysis,'expansion':expansion}[state].append((pid,l))
 if not stem or not analysis:continue
 bid='d-'+str(mod=='中国近现代史纲要' and 3 or mod.startswith('毛泽东') and 2 or 1)+'-'+str(no)
 parent={'id':bid,'kind':'干扰项','module':mod,'topic':'经典干扰项总结','title':clean(''.join(l['t'] for _,l in stem)).lstrip('）'),'text':clean('\n'.join(l['t'] for _,l in segment)),'refs':[],'questionIds':[],'originalNo':no,'explanation':clean(''.join(l['t'] for _,l in analysis))}
 for pid in dict.fromkeys(pid for pid,_ in segment):
  ls=[l for pp,l in segment if pp==pid];y=min(l['b'][1] for l in ls)-7;b=max(l['b'][1]+l['b'][3] for l in ls)+7
  parent['refs'].append(ref(pid,[90,y,by[pid]['width']-180,b-y],ls))
 blocks.append(parent)

def judgement(block,text,truth,evidence,mark):
 # Printed commentary before an example is context, not part of its proposition.
 text=re.split(r'经典干扰项[：:]|比如[：:，]|举例[：:]',text)[-1]
 text=clean(re.sub(r'^(拓展[：:]\s*)?[①②③④⑤⑥⑦⑧⑨⑩）\s]*','',text)).strip()
 text=re.sub(r'[（(]\s*[×xX√✓]\s*[）)]','',text).strip()
 if not 6<=len(text)<=180 or re.search(r'^\d+$|^第.*部分',text):return
 identity=hashlib.sha1((block['id']+text).encode()).hexdigest()[:10];qid='mj'+identity
 if any(q['id']==qid for q in exercises):return
 exercises.append({'id':qid,'moduleIdx':8,'module':'背诵手册 · 概念辨析','chapter':block['module'],'chapterTitle':'判断练习','section':'判断题','no':len(exercises)+1,'multi':False,'source':'m','exerciseKind':'judgement','blockId':block['id'],'stem':text,'options':{'A':'正确','B':'错误'},'answer':'A' if truth else 'B','analysis':[{'k':'原书依据','t':evidence}],'qRefs':list(dict.fromkeys(r['page'] for r in block['refs'])),'keyRefs':list(dict.fromkeys(r['page'] for r in block['refs'])),'mRefs':[],'aPages':[],'aCrops':[],'kPages':[],'sPages':[],'sourceVerdict':mark})
 block['questionIds'].append(qid)
for block in blocks:
 if block['kind']=='干扰项':
  judgement(block,block['title'],False,block['explanation'],'原书干扰项及辨析')
  # The first complete sentence of the printed 辨析 supplies a true counterpart.
  # Skip incomplete quotations and overlong statements instead of rewriting them.
  explanation=re.sub(r'^辨析[：:]','',block['explanation'])
  correct=explanation.split('。')[0]+'。'
  if '。' in explanation and all(correct.count(a)==correct.count(b) for a,b in [('“','”'),('（','）'),('《','》')]):
   judgement(block,correct,True,block['explanation'],'原书辨析')
 text=block['text'];buffer='';inExpansion=block['kind']!='干扰项'
 for line in text.split('\n'):
  if line.startswith('拓展'):inExpansion=True;buffer=''
  if re.search(r'^干扰项\d|^辨析[：:]|命题分析|考查频率|^经典干扰项',line):buffer='';continue
  if not inExpansion:continue
  if re.match(r'^(拓展[：:])?[①②③④⑤⑥⑦⑧⑨⑩]',line):buffer=''
  buffer+=line
  m=re.search(r'[（(]\s*([×xX√✓])\s*[）)]',buffer)
  if m:
   claim=buffer[:m.end()]
   judgement(block,claim,m[1] in '√✓',('原书标记：'+('正确' if m[1] in '√✓' else '错误')+'。'+block.get('explanation','')+'\n'+clean(claim)),'原书'+m[1])
   buffer=buffer[m.end():]
  elif re.search(r'[（(]\s*[）)]\s*$',buffer):buffer=''

# Only use complete tested phrases or well-defined concept terms. No filler masks.
questions=load(DATA/'questions.json')+load(DATA/'topical-exercises.json')+load(DATA/'manual-questions.json')
normalize=lambda s:re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s).replace('和','与').lower()
terms=collections.defaultdict(set)
stop={'中国','中国共产党','马克思主义','社会主义','发展','建设','坚持','人民','实践','意识','认识'}
for q in questions:
 for k in q['answer']:
  opt=q['options'][k]
  for phrase in re.split(r'[，,；;：:。]|——|—',opt):
   phrase=re.sub(r'^(?:它|这|是|在于|表明|标志着|坚持|必须坚持)','',phrase.strip())
   if any(phrase.count(a)!=phrase.count(b) for a,b in [('“','”'),('（','）'),('《','》')]):continue
   phrase=normalize(phrase)
   if 4<=len(phrase)<=24 and phrase not in stop:terms[phrase].add(q['id'])
vocab='客观实在性|科学性与革命性的统一|人民性|科学性|实践性|发展性|社会实践|主观能动性|客观规律性|绝对运动|相对静止|对立统一规律|量变质变规律|否定之否定规律|矛盾的普遍性|矛盾的特殊性|矛盾同一性|矛盾斗争性|实践观点|感性认识|理性认识|真理的绝对性|真理的相对性|实践是检验真理的唯一标准|社会存在|社会意识|生产力|生产关系|经济基础|上层建筑|人民群众|使用价值|交换价值|具体劳动|抽象劳动|社会必要劳动时间|剩余价值|劳动力商品|资本有机构成|垄断资本主义|金融资本|新民主主义革命|社会主义革命|无产阶级领导权|农村包围城市|武装夺取政权|统一战线|武装斗争|党的建设|社会主义初级阶段|共同富裕|解放思想|实事求是|与时俱进|求真务实|以人民为中心|高质量发展|中国式现代化|全过程人民民主|全面依法治国|总体国家安全观|人类命运共同体|全面从严治党|半殖民地半封建社会|民族资产阶级|官僚资本主义|社会主义核心价值观|爱国主义|改革创新|理想信念|法治思维|人民代表大会制度|生命健康权|人身自由权|人格尊严权|受教育权|中国共产党的领导|客观世界的主观映象|认识世界和改造世界|资本主义经济的发展|社会发展规律|科学社会主义|德国古典哲学|英国古典政治经济学|英法空想社会主义'.split('|')
vocab += '主观唯心主义|客观唯心主义|绝对的|相对的|无条件的|有条件的|时空观念|自发产生|有目的的实践活动|差别和对立|对抗性|非对抗性|认识的起点|认识的深化|自我否定|否定之否定|古代朴素辩证法|唯物辩证法|形而上学|相对主义诡辩论|真象|假象|必然性|偶然性|现实的可能|抽象的可能|实践客体|虚拟实践|直接经验|间接经验|主观真理标准论|现实的主体|宿命论|唯意志论|历史范畴|资本家的监督|全部归资本家所有|三座大山|互助合作|个体经济|自我完善和发展|制度型开放|国家统一|台湾问题|香港和澳门|首要任务|社会的性质|反帝反封建|民族独立|人民解放|君主专制制度|君主立宪制度|民主共和制度|封建正统思想|新三民主义|国共合作|东北易帜|井冈山土地法|北洋军阀|人民政协|临时宪法|调整、巩固、充实、提高|毛泽东同志的历史地位|核心价值观|普世价值|全人类共同价值|诚实守信|奉献社会|国家强制性|作为|不作为|法定义务|法律依据|行政责任|民事责任|刑事责任'.split('|')
for word in vocab:terms.setdefault(normalize(word),set())
qsBy={q['id']:q for q in questions}
normalTerms=sorted(terms,key=lambda t:(-len(terms[t]),-len(t),t))
for p in pages:
 pid=p['id'];ls=raw[pid]['lines'];eligible=(p['vol']=='upper' and 9<=p['page']<=237) or (p['vol']=='lower' and (8<=p['page']<=16 or 66<=p['page']<=166))
 p['masks']=[];p['maskCandidates']=[];p['maskSets']={'core':[],'exam':[],'more':[]}
 p['tags']=sorted({b['kind'] for b in blocks if any(r['page']==pid for r in b['refs'])})
 if not eligible:continue
 protected=set()
 for i,l in enumerate(ls):
  if re.match(r'^专题[一二三四五六七八九十]+',l['t']):
   for j,x in enumerate(ls):
    if abs(x['b'][1]-l['b'][1])<45:protected.add(j)
 candidates=[]
 for li,l in enumerate(ls):
  words=l.get('words',[]);t=''.join(w['t'] for w in words)
  if li in protected or l['b'][1]<165 or l['b'][3]>38 or re.search(r'考查频率|真题|^第[一二三四五六]部分|^目录|^专题|命题分析|郑重声明|购买渠道|出版社|版权|[（(][×xX][）)]|^干扰项',t):continue
  chars=[];mapping=[]
  for wi,w in enumerate(words):
   for c in w['t']:
    n=normalize(c)
    if n:chars.append(n);mapping.append(wi)
  text=''.join(chars)
  for term in normalTerms:
   start=text.find(term)
   if start<0:continue
   ws=words[mapping[start]:mapping[start+len(term)-1]+1]
   # Keep contextual prose visible; table cells have their clue in the same row.
   if len(term)>len(text)*.65 and l['b'][2]>600:continue
   x=min(w['b'][0] for w in ws);y=min(w['b'][1] for w in ws);r=max(w['b'][0]+w['b'][2] for w in ws);bottom=max(w['b'][1]+w['b'][3] for w in ws)
   related=sorted(terms[term])[:3]
   candidates.append({'id':f'v111-{pid}-{li}-{mapping[start]}','b':[x,y,r-x,bottom-y],'text':''.join(w['t'] for w in ws),'reason':'题目考查' if related else '概念辨析','questionIds':related,'score':min(20,len(terms[term]))*4+len(term),'line':li})
 selected=[];lines=collections.Counter()
 for c in sorted(candidates,key=lambda c:-c['score']):
  if lines[c['line']]>=1:continue
  if any(c['b'][0]<d['b'][0]+d['b'][2] and c['b'][0]+c['b'][2]>d['b'][0] and abs(c['b'][1]-d['b'][1])<8 for d in selected):continue
  selected.append(c);lines[c['line']]+=1
  if len(selected)>=40:break
 for block in blocks:
  for reference in block['refs']:
   if reference['page']!=pid:continue
   x,y,w,h=reference['b']
   block.setdefault('masksByPage',{})[pid]=[c for c in selected if x<=c['b'][0]+c['b'][2]/2<=x+w and y<=c['b'][1]+c['b'][3]/2<=y+h][:12]
 for name,limit in [('core',3),('exam',6),('more',12)]:p['maskSets'][name]=selected[:limit]
 p['masks']=p['maskSets']['exam']
 p['maskCandidates']=selected

# Bound topics at their next heading, omit covers, ads and copyright pages.
headings=[]
for n in range(9,238):
 for l in raw[f'u{n:03}']['lines']:
  if re.match(r'^专题[一二三四五六七八九十]+',l['t']):headings.append((n,max(165,l['b'][1]-38)))
for i,t in enumerate(index['topics']):
 t['pages']=[pid for pid in t['pages'] if (pid[0]=='u' and int(pid[1:])<=237 and int(pid[1:]) not in [72,96,150,201]) or (pid[0]=='l' and int(pid[1:])<=166)]
 t['regions']={}
 if t['vol']=='upper':
  n,y=headings[i];end,ey=headings[i+1] if i+1<len(headings) else (237,by['u237']['height'])
  for pid in list(t['pages']):
   pn=int(pid[1:]);low=y if pn==n else 165;high=ey if pn==end else by[pid]['height']
   if high-low<25:t['pages'].remove(pid);continue
   t['regions'][pid]=[low,high]
 index['version']=111
exercises.sort(key=lambda q:hashlib.sha1(q['id'].encode()).hexdigest())
for no,q in enumerate(exercises,1):
 q['no']=no
 assert q['stem'] and q['answer'] in 'AB' and q['blockId'] in {b['id'] for b in blocks}
assert len([b for b in blocks if b['kind']=='干扰项'])==54, [(b['id'],b['title']) for b in blocks if b['kind']=='干扰项']
assert all(int(r['page'][1:])<=237 if r['page'][0]=='u' else int(r['page'][1:])<=166 for b in blocks for r in b['refs'])
index['studyVersion']=111
study={'version':111,'blocks':blocks,'questions':exercises}
(DATA/'manual-index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n')
(DATA/'manual-study.json').write_text(json.dumps(study,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'blocks':dict(collections.Counter(b['kind'] for b in blocks)),'judgements':len(exercises),'true':sum(q['answer']=='A' for q in exercises),'false':sum(q['answer']=='B' for q in exercises),'recommendedMasks':sum(len(p['masks']) for p in pages),'testedMasks':sum(bool(m['questionIds']) for p in pages for m in p['masks'])},ensure_ascii=False))
