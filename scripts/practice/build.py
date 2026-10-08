import json,re,collections
from pathlib import Path
R=Path(__file__).resolve().parents[2];W=R/'.practice-build';sources=json.loads((W/'sources.json').read_text());layouts={s['id']:json.loads((W/'text'/f"{s['id']}-layout.json").read_text()) for s in sources};CIRC='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';DIG={c:str(i+1) for i,c in enumerate(CIRC)}
MODS=['马克思主义基本原理','思想道德与法治','中国近现代史纲要','毛泽东思想和中国特色社会主义理论体系概论','习近平新时代中国特色社会主义思想概论']
norm=lambda s:re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s).lower()
def ref(p,lo=35,hi=None):return {'page':p['page'],'b':[20,round(max(0,lo),2),round(p['width']-40,2),round(min(p['height']-25,hi or p['height']-25)-max(0,lo),2)]}
def common(b,typ,n,module,chapter,stem):return {'id':f'pr-{b}-{typ}-{n:04}','bookId':b,'type':typ,'source':'p','moduleIdx':9,'module':module,'chapter':chapter,'chapterTitle':chapter,'section':'连线题' if typ=='matching' else '材料分析题' if typ=='written' else '选择题','no':n,'stem':stem,'options':{},'multi':False,'answer':'','kPages':[],'sPages':[],'mRefs':[],'aPages':[],'aCrops':[],'analysis':[],'qRefs':[],'keyRefs':[]}
def note_lines(lines):
 for l in lines:
  m=re.search(r'[ABCD][.．、]',l['t'])
  if m and m.start()>0 and l['t'].startswith('——') and any('KaiTi' in s['font'] for s in l['spans']):
   yield dict(l,t=l['t'][:m.start()]);yield dict(l,t=l['t'][m.start():])
  else:yield l

def notes(b):
 ps=layouts[b];qs=[];q=None;module=MODS[0] if b=='cf-upper' else MODS[2];chapter='导论';multi=False;field=None;explain=False
 for p in ps:
  if p['page']<3:continue
  for l in note_lines(p['lines']):
   t=l['t'];sp=l['spans'];size=max(s['size'] for s in sp)
   if l['b'][1]>p['height']-45 or t.startswith(('笔记勘误文件','8 月底','乘风考研')):continue
   if size>=18 and '部分' in t:
    if '思想道德' in t:module=MODS[1]
    elif '毛泽东' in t:module=MODS[3]
    elif '习近平' in t:module=MODS[4]
    elif '近现代史' in t:module=MODS[2]
    else:module=MODS[0]
    continue
   if size>=13 and (re.match(r'^[\uf06c•●\s]*第[一二三四五六七八九十]+章',t) or t.lstrip('\uf06c•●') in ['导论','绪论']):chapter=t.lstrip('\uf06c•●');continue
   if re.match(r'^[一二三、\s]*(单项|多项)选择题$',t):multi='多项' in t;continue
   m=re.match(r'^(\d{1,3})(?:[.．、]|(?=[“‘])|\s+)(.*)',t)
   red=any((s['color']>>16)>140 and ((s['color']>>8)&255)<80 and (s['color']&255)<90 for s in sp[:2])
   if m and red and l['b'][0]<60:
    if q:q['_end']=(p['page'],l['b'][1]-3)
    q=common(b,'choice',len(qs)+1,module,chapter,m[2]);q.update(originalNo=int(m[1]),multi=multi,_start=(p['page'],l['b'][1]-4),_rows=[],_notes=[]);q['section']='多项选择题' if multi else '单项选择题';qs.append(q);field='stem';explain=False;continue
   if not q:continue
   q['_rows'].append((p['page'],l));opt=re.match(r'^([ABCD])(?:[.．、]\s*|\s+)(.*)',t)
   if opt:
    field=opt[1];q['options'][field]=opt[2];explain=False
    if any(s['color']==0x4874cb and re.search('[ABCD]',s['text']) for s in sp):q['answer']+=field
   elif field=='stem':
    if any('KaiTi' in s['font'] for s in sp) or t.startswith(('——','【')):q['_notes'].append(t)
    else:q['stem']+=t
   else:
    if t.startswith(('——','【')) or any('KaiTi' in s['font'] for s in sp):explain=True
    if not explain and (any(s['color']==0x4874cb for s in sp) or all(s['font'] in ['SimHei','SimSun','DengXian'] for s in sp)):q['options'][field]+=t
    else:q['_notes'].append(t)
 if q:q['_end']=(ps[-1]['page'],ps[-1]['height']-45)
 for q in qs:
  start,lo=q.pop('_start');end,hi=q.pop('_end');q['qRefs']=[ref(ps[n-1],lo if n==start else 35,hi if n==end else ps[n-1]['height']-45) for n in range(start,end+1) if not(n==end and hi<40)];q['keyRefs']=q['qRefs'];q['answer']=''.join(sorted(set(q['answer'])));q.pop('_rows');q['analysis']=[{'k':'乘风逐题批注','t':'\n'.join(q.pop('_notes')) or '此题没有独立文字批注，请核对笔记原页。'},{'k':'答案依据','t':'原笔记蓝色选项标注。'}]
 return qs

def heads(b,ls):
 if b in ['leg-marx','xu-marx']:return [l for l in ls if re.match(r'^\d+[.．、]',l['t']) and re.search('连线|请将|将左|对应|配对|错配|匹配',l['t'])]
 if b in ['history-second','ethics-match']:return [l for l in ls if re.match(r'^连线题\s*\d+',l['t'])]
 if b=='xu-ethics':return ls[:1] if ls and re.search('连线题|学成选择',ls[0]['t']) else []
 return [l for l in ls if re.match(r'^[一二三四]、.*连线',l['t'])]
def items(ls,side,pat,stop,threshold):
 chosen=[l for l in ls if l['b'][1]<stop and (l['b'][0]<threshold if side=='left' else l['b'][0]>=threshold)];chosen.sort(key=lambda l:(round(l['b'][1],1),l['b'][0]));out=[];cur=None
 for l in chosen:
  t=l['t']
  if re.match(r'^[A-Z1-9][.．]?\s*[—－–\-→]',t):continue
  m=re.match(pat,t)
  if m:
   if cur:out.append(cur)
   cur={'key':DIG.get(m[1],m[1]),'originalLabel':m[1],'text':m[2].strip()}
  elif cur and not re.search(r'^答案|^解析|《考点|乘风考点|^P\d|^第\d+\s*页|^左列|^右列|^连线|^请将|DAY',t):cur['text']+=t
 if cur:out.append(cur)
 return out

def matching(b):
 ps=layouts[b];segments=[];day='';chapter='';isAnswer=False
 for p in ps:
  ls=p['lines'];txt='\n'.join(l['t'] for l in ls);d=re.search(r'(?:腿)?DAY\s*(\d+)',txt,re.I)
  if d:day='DAY'+d[1];isAnswer=False
  if b in ['leg-marx','xu-marx'] and any(l['t']=='答案' and l['b'][1]<130 for l in ls):isAnswer=True
  cs=[l['t'] for l in ls if re.match(r'^(第[一二三四五六七八九十]+章|绪论)',l['t']) and l['b'][1]<150]
  if cs:chapter=''.join(cs)
  hs=heads(b,ls)
  for j,h in enumerate(hs):
   lo=h['b'][1];hi=hs[j+1]['b'][1]-3 if j+1<len(hs) else p['height']-30;sub=[l for l in ls if lo<=l['b'][1]<hi];refs=[ref(p,lo-4,hi)]
   if j==len(hs)-1 and p['page']<len(ps):
    nxt=ps[p['page']];lim=next((l['b'][1] for l in nxt['lines'] if l in heads(b,nxt['lines']) or re.search(r'^连线题答案|^(?:腿)?DAY|^第[一二三四五六七八九十]+章',l['t'])),nxt['height']-30);prefix=[l for l in nxt['lines'] if l['b'][1]<lim and l['b'][1]<nxt['height']-35]
    if prefix and not re.search('连线题|学成选择|DAY',prefix[0]['t']):
     for l in prefix:
      v=dict(l);v['b']=list(l['b']);v['b'][1]+=p['height'];v['b'][3]+=p['height'];sub.append(v)
     refs.append(ref(nxt,35,lim-3));hi=p['height']+lim-3
   subtext='\n'.join(l['t'] for l in sub);al=next((l for l in sub if re.match(r'^答案[：:]|^解析[：:]',l['t'])),None);stop=al['b'][1] if al else hi
   lp=r'^([1-9])\s*(.*)$' if b=='xu-ethics' else r'^([A-Z])[.．、]?\s*(.*)$';rp=r'^([A-Z])[.．、]?\s*(.*)$' if b=='xu-ethics' else r'^(['+CIRC+r'])\s*(.*)$';xs=[l['b'][0] for l in sub if re.match(rp,l['t']) and l['b'][1]>lo+15]
   if not xs:continue
   threshold=min(xs)-5;left=items(sub,'left',lp,stop,threshold);right=items(sub,'right',rp,stop,threshold)
   if b=='xu-ethics':
    for k,i in enumerate(right):i['key']=str(k+1)
   maps={}
   for a,raw in re.findall(r'([A-Z1-9])[.．]?\s*[—－–\-→]\s*(['+CIRC+r'A-Z]+)',subtext):
    if a not in maps:maps[a]=[str(ord(c)-64) if b=='xu-ethics' and c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' else DIG.get(c,c) for c in raw]
   if len(left)<2 or len(right)<2:continue
   segments.append({'page':p['page'],'title':h['t'],'chapter':day or chapter,'left':left,'right':right,'maps':maps,'answer':isAnswer or bool(maps) or (b in ['leg-round','xu-history'] and '答案' in h['t']),'refs':refs,'text':subtext,'ansY':al['b'][1] if al else None})
 
 qs=[];ans=[s for s in segments if s['answer']];module=MODS[1] if b in ['ethics-match','xu-ethics'] else MODS[2] if b in ['leg-round','xu-history','history-second'] else MODS[0]
 for seg in segments:
  same=b in ['ethics-match','history-second']
  if seg['answer'] and not same:continue
  q=common(b,'matching',len(qs)+1,module,seg['chapter'] or '专题连线',seg['title']);q.update(left=seg['left'],right=seg['right'],matchMap={},qRefs=[dict(r,b=r['b'][:]) for r in seg['refs']]);qs.append(q)
  a=seg if same else None
  if not a:
   sig=norm(''.join(i['text'] for i in seg['left']));cand=[a for a in ans if norm(''.join(i['text'] for i in a['left']))==sig]
   if not cand:cand=[a for a in ans if re.sub(r'答案|（.*?）|\s+','',a['title'])==re.sub(r'答案|（.*?）|\s+','',q['stem']) and a['page']>=seg['page']]
   if cand:a=min(cand,key=lambda a:abs(a['page']-seg['page']));ans.remove(a)
  if a:
   q['matchMap']=a['maps'];q['keyRefs']=a['refs'];q['analysis']=[{'k':'原书配对与讲解','t':a['text'][a['text'].find('答案'):] if '答案' in a['text'] else '原书配对：'+'；'.join(k+'—'+','.join(v) for k,v in a['maps'].items())}]
   if same and seg['ansY']:q['qRefs'][0]['b'][3]=seg['ansY']-q['qRefs'][0]['b'][1]-4
  q['multiMatch']=any(len(v)>1 for v in q['matchMap'].values())
 return qs

def daily():
 b='xu-daily';ps=layouts[b];flat=[];day=0;off=0
 for p in ps:
  for l in p['lines']:
   if l['b'][1]>p['height']-28:continue
   d=re.match(r'^徐涛马原Day\s*(\d+)\s*任务',l['t'],re.I)
   if d:day=int(d[1])
   flat.append(dict(l,day=day,page=p['page'],y=off+l['b'][1]))
  off+=p['height']
 groups=collections.defaultdict(list)
 for l in flat:groups[l['day']].append(l)
 qs=[]
 yrpat=r'^((?:19|20)\d{2})[-—－–]{1,2}(\d{1,2})[.．、]?\s*(.*)'
 for day,ls in groups.items():
  begin=next((i for i,l in enumerate(ls) if l['t']=='往年真题重现'),None)
  if begin is None:continue
  end=next((i for i,l in enumerate(ls) if i>begin and (l['t'] in ['答案解析','真题答案解析'] or (l['t']=='题目' and l['b'][0]<150))),len(ls))
  zone=ls[begin+1:end];anchors=[];year=None
  for i,l in enumerate(zone):
   y=re.match(r'^[（(](20\d{2}).*单选[)）]',l['t'])
   if y:year=y[1]
   m=re.match(yrpat,l['t'])
   early=re.match(r'^(\d{1,2})[.．](.*)',l['t']) if day==1 else None
   if m:anchors.append((i,m[1],int(m[2]),m[3]))
   elif early:anchors.append((i,year,int(early[1]),early[2]))
  dayqs=[]
  def refs_for(rows):
   out=[]
   for pn in dict.fromkeys(l['page'] for l in rows):
    part=[l for l in rows if l['page']==pn];out.append(ref(ps[pn-1],min(l['b'][1] for l in part)-3,max(l['b'][3] for l in part)+4))
   return out
  for ai,(i,year,num,first) in enumerate(anchors):
   last=anchors[ai+1][0] if ai+1<len(anchors) else len(zone);rows=zone[i:last];typ='written' if num>=34 else 'choice';stem=[re.sub(r'^[（(](?:单选|多选)[)）][.．]?\s*','',first)];opts={};field=None
   for l in rows[1:]:
    t=l['t']
    if re.search(r'下一页|答案解析|^[（(]20\d{2}.*单选',t):continue
    matches=list(re.finditer(r'(?:^|\s)([ABCD])(?:[.．、]\s*|\s+)',t))
    if typ=='choice' and matches:
     for k,m in enumerate(matches):field=m[1];opts[field]=t[m.end():matches[k+1].start() if k+1<len(matches) else len(t)]
    elif field:opts[field]+=t
    else:stem.append(t)
   q=common(b,typ,len(qs)+1,MODS[0],'DAY'+str(day),'\n'.join(stem));q.update(examYear=year,originalNo=num,multi=(17<=num<=33),options=opts,qRefs=refs_for(rows));q['section']='材料分析题 · 自评' if typ=='written' else '多项选择题' if q['multi'] else '单项选择题';qs.append(q);dayqs.append(q)
  ans=ls[end:];aheads=[]
  for i,l in enumerate(ans):
   m=re.match(yrpat,l['t']);early=re.match(r'^(\d{1,2})[.．、]\s*(?:答案[：:]\s*)?([ABCD])',l['t']) if day<=2 else None
   if m:
    if aheads and aheads[-1][1:3]==(m[1],int(m[2])):continue
    aheads.append((i,m[1],int(m[2])))
   elif early:aheads.append((i,None,int(early[1])))
  remaining=dayqs[:]
  for k,(i,year,num) in enumerate(aheads):
   candidates=[q for q in remaining if q['originalNo']==num and (year is None or q['examYear']==year)]
   if not candidates and year is None and 1<=num<=len(dayqs):candidates=[dayqs[num-1]] if dayqs[num-1] in remaining else []
   if not candidates:continue
   q=candidates[0];remaining.remove(q);lo=i
   while lo>0 and ans[i]['y']-ans[lo-1]['y']<12:lo-=1
   rows=ans[lo:aheads[k+1][0] if k+1<len(aheads) else len(ans)];q['keyRefs']=refs_for(rows)
   if q['type']=='choice' and set(q['options'])!=set('ABCD'):
    field=None
    for l in rows:
     if l['b'][0]>=280:continue
     m=re.match(r'^([ABCD])[.．、]\s*(.*)',l['t'])
     if m and m[1] not in q['options']:q['options'][m[1]]=m[2];q['extractionNote']='题面漏印的选项按原文件解析页同题补齐。'
   table=any(l['b'][0]>=280 and (l['t']=='答案' or re.search('答案|正确|解析',l['t'])) for l in rows)
   text='\n'.join(l['t'] for l in rows if not table or l['b'][0]>=280 or q['type']=='written');q['analysis']=[{'k':'原书答案与解析','t':text}]
   if q['type']=='written':continue
   for l in rows:
    if table and l['b'][0]<280 and not re.search(r'[【\[]答[案業][】\]]',l['t']):continue
    t=re.sub(r'[（(](?:单选|多选)[)）]','',l['t']);t=re.sub(yrpat,lambda m:m[3],t);t=re.sub(r'^\d+[.．、]\s*','',t)
    a=re.search(r'(?:[【\[]答[案業][】\]]|答案[：:]?)\s*([ABCD](?:[、,，\s]*[ABCD])*)',t)
    if not a:a=re.match(r'^([ABCD](?:[、,，]*[ABCD])*)\s*(?:正确|全选|[。.]|$|【解析】)',t)
    if a:q['answer']=''.join(sorted(set(re.findall('[ABCD]',a[1]))));break
 return qs

results={}
for s in sources:
 b=s['id'];qs=notes(b) if b.startswith('cf') else daily() if b=='xu-daily' else matching(b);results[b]=qs;print(b,len(qs),flush=True)
errors=[]
for qs in results.values():
 for q in qs:
  if q['type']=='choice' and (set(q['options'])!=set('ABCD') or not all(q['options'].values()) or not q['answer'] or (not q['multi'] and len(q['answer'])!=1)):errors.append(q)
  if q['type']=='matching' and (set(q['matchMap'])!={i['key'] for i in q['left']} or any(set(v)-{i['key'] for i in q['right']} for v in q['matchMap'].values()) or any(not i['text'] for i in q['left']+q['right'])):errors.append(q)
  if not q['keyRefs']:errors.append(q)
(W/'questions-draft.json').write_text(json.dumps(results,ensure_ascii=False));(W/'errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2));print('TOTAL',sum(map(len,results.values())),'ERRORS',len(errors))
