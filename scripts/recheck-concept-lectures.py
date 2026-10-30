"""Recover missing lecture panels using equivalent definitions, table headings and page continuations.
Only original-source text is linked; existing question data and references are preserved.
"""
import importlib.util,pathlib,json,re,collections,urllib.request,time,hashlib,difflib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
r=module('review','review-lecture-links.py');r.ROOT=ROOT;rc=module('prior','recheck-missing-lectures.py');VERSION=137
NORMAL=r.norm

def canon(text,mapping=False):
 text,pos=NORMAL(text,True);chosen=[i for i,c in enumerate(text) if c!='的'];out=''.join(text[i] for i in chosen);indices=[pos[i] for i in chosen];return (out,indices) if mapping else out

def facts(q):
 result=rc.extra_facts(q);stem=q.get('stem','');marks=list(re.finditer('[①-⑳]',stem));numbered={m[0]:stem[m.end():marks[i+1].start() if i+1<len(marks) else len(stem)].strip() for i,m in enumerate(marks)};prefix=stem[:marks[0].start()] if marks else stem
 for key in q.get('answer',''):
  selected=q.get('options',{}).get(key,'');labels=re.findall('[①-⑳]',selected)
  if labels and all(ch in numbered or ch in '、，,；;和与及 ' for ch in selected):
   result.extend((prefix,numbered[ch],'pair') for ch in labels if len(NORMAL(numbered[ch]))>=4)
  clean=re.split('——|\n|【',selected)[0].strip()
  if clean and clean!=selected:result.append((stem[-400:],clean,'pair'))
  # Reorder an explicitly stated attribute relation, without inverting a category.
  relation=re.fullmatch(r'(.{1,30}?)是(.{2,35}?(?:形式|属性|特性|标志|基础|前提|原因|动力|源泉|途径|目的|任务|尺度|原则|要求))',clean)
  if relation:result.append((stem[-400:],relation[2]+'是'+relation[1],'pair'))
 return list(dict.fromkeys((canon(p),canon(a),t) for p,a,t in result if len(canon(a))>=2))

GENERIC={'工人阶级','无产阶级','人民群众','中国共产党','社会主义','资本主义','生产力','生产关系','人民','实践','价值','真理','认识','物质','运动','一般规律','精神境界','政治建设','生产方式','社会发展','经济发展','历史发展','政治制度','理论体系','历史进步','科学技术','根本原因','精神力量','重要保障','重要作用'}
SEMANTIC_TERMS=[
 (r'永恒.*(?:运动|变化).*发展', ['发展是一个过程']),
 (r'感性认识.*(?:渗透|理性)|理性认识.*感性', ['感性认识与理性认识','感性认识和理性认识']),
 (r'意识活动.*创造|意识.*调控.*(?:生理|行为)', ['意识能动性']),
 (r'认识.*(?:源于|来源于|来自).*实践', ['实践是认识来源']),
 (r'透过现象.*本质|现象.*(?:把握|揭示).*本质', ['现象与本质','现象和本质']),
 (r'先进文化.*社会|文化.*(?:精神动力|引导.*社会)', ['社会意识作用','社会意识相对独立性']),
 (r'单位.*商品.*价值量|单位时间.*商品.*(?:数量|多)', ['商品价值量','劳动生产率']),
 (r'矛盾.*特殊性|具体问题具体分析', ['矛盾特殊性','矛盾普遍性和特殊性']),
 (r'量变.*(?:质变|积累)|质变.*量变', ['量变和质变','量变与质变','量变质变规律']),
 (r'前进.*曲折|(?:反复|倒退).*发展|发展.*(?:曲折|倒退)', ['否定之否定规律','前进性与曲折性','前进性和曲折性']),
 (r'生产力.*生产关系|生产关系.*生产力', ['生产力与生产关系','生产力和生产关系']),
 (r'^资本价值构成$', ['价值构成']),
 (r'同历史前进方向是否符合', ['新事物']),
 (r'任何事物.*(?:中介|联系)', ['联系具有普遍性']),
 (r'放在普遍联系.*系统', ['联系具有普遍性','系统观念']),
 (r'发现并利用规律|认识和利用规律', ['规律客观性','尊重客观规律']),
 (r'主体与客体相互作用.*过程和结果', ['认识本质']),
]
def semantic_terms(q):
 values=[q.get('options',{}).get(k,'') for k in q.get('answer','')]+[m['text'] for m in q.get('cloze',{}).get('masks',[])]
 return [term for pattern,terms in SEMANTIC_TERMS if any(re.search(pattern,canon(value)) for value in values) for term in terms]
def terms(q):
 out=[]
 for k in q.get('answer',''):
  text=re.split('——|\n|【',q.get('options',{}).get(k,''))[0].strip();term=canon(text)
  if 4<=len(term)<=24 and term not in GENERIC and not re.search('不是|不能|没有|不具有|并非',term):out.append(term)
  m=re.fullmatch('(.{1,24}?)是(.{4,24}?(?:形式|属性|特性|标志|基础|前提|原因|动力|源泉|途径|目的|任务|尺度|原则|要求))',term)
  if m:out.append(m[2])
  if re.fullmatch('.{1,5}性',term):
   for root in ['联系','规律','意识','真理','价值','认识','矛盾']:
    if root in q.get('stem','')[-60:]:out.extend([root+term,root+'具有'+term])
 if q.get('type')=='cloze':
  out.extend(canon(m['text']) for m in q.get('cloze',{}).get('masks',[]) if 4<=len(canon(m['text']))<=24 and canon(m['text']) not in GENERIC)
  if '党的建设' in q.get('stem','') and any(canon(m['text'])=='政治建设' for m in q.get('cloze',{}).get('masks',[])):out.append('党政治建设')
 out.extend(semantic_terms(q))
 return list(dict.fromkeys(out))

class DefinitionCorpus(r.Corpus):
 def __init__(self,kind,data,modules):
  global NORMAL
  saved=r.norm;r.norm=canon
  try:super().__init__(kind,data,modules)
  finally:r.norm=saved
  self.joined=None
 def heading(self,q,module):
  hits=[];prompt=canon(q.get('stem',''));qualifiers=[canon(x) for x in r.QUALIFIERS+['中心问题','战略基点','统领','牵引','核心标志','第一动力','重要前提'] if canon(x) in prompt[-110:]]
  for term in terms(q):
   pages=set(self.ix.get(term[:5],())) if len(term)>=5 else {p for p,v in self.pages.items() if term in v['text']}
   pages={p for p in pages if term in self.pages[p]['text']}
   if not pages:continue
   for pn in pages:
    p=self.pages[pn]
    if module and p['modules'] and module not in p['modules']:continue
    offset=0
    for line in p['raw'].splitlines(keepends=True):
     norm=canon(line);at=norm.find(term);plain=re.sub(r'^[0-9一二三四五六七八九十（）、]+','',norm);location=plain.find(term)
     prefix=plain[:location] if location>=0 else '';prefix_ok=not prefix or bool(re.fullmatch(r'(考|比较|坚持|必须坚持|是|指|含义|定义|(?:专题|重点考点|考点)[一二三四五六七八九十0-9]*)',prefix)) or bool(re.search(r'(问题|构成|性质|概念|本质|特征|原则|属性|首要|根本|主要|著作|标志|前提|源泉|目的|任务|尺度|基础|道路|制度|方针|重点|地位|要求|条件|核心|关键|保障|牵引|统领|基点)$',prefix))
     is_heading=prefix_ok and location>=0 and location<=12 and len(plain)<=max(len(term)+15,32) and not re.search('不是|不能|没有|不具有|并非|错误|×',line)
     if is_heading and (location<=2 or re.search('^第|考|问题|构成|性质|概念|本质|特征|原则|属性|首要|根本|主要|著作|标志',plain[:location])):
      a=p['raw'].rfind('\n',0,max(0,offset-55))+1;z=p['raw'].find('\n',min(len(p['raw']),offset+len(line)+190));z=len(p['raw']) if z<0 else z;quote=p['raw'][a:z].strip();near=canon(quote)
      if qualifiers and not any(x in near for x in qualifiers):offset+=len(line);continue
      if len(re.findall(r'[A-D][.．、]',quote))>=3:offset+=len(line);continue
      # A named heading is reference material about this concept, not a claim
      # that a generic page independently proves the question's entire answer.
      hits.append({'page':pn,'quote':quote,'method':'concept-definition','note':'对应考点：'+term+'。以下为该概念或事项的原文讲解，可结合题目核对。','term':term,'score':len(term)*2-location+sum(1 for g in r.grams(prompt,4) if g in near and g not in r.grams(term,4))});break
     offset+=len(line)
  hits.sort(key=lambda e:-e['score']);unique={}
  for e in hits:
   if e['page'] not in unique:unique[e['page']]=e
  return list(unique.values())[:1]
 def continuation(self,fs,module):
  fs=[x for x in fs if len(x[1])>=12]
  if not fs:return []
  if self.joined is None:
   joined={};mods={};origin={};keys=sorted(self.pages,key=lambda key:(re.sub(r'\d+$','',str(key)),int(re.search(r'(\d+)$',str(key))[1]) if re.search(r'(\d+)$',str(key)) else 0))
   for left,right in zip(keys,keys[1:]):
    p,q=self.pages[left],self.pages[right]
    # Do not join different books or a new chapter/topic.
    a=re.fullmatch(r'(.*?)(\d+)',str(left));b=re.fullmatch(r'(.*?)(\d+)',str(right))
    if not a or not b or a[1]!=b[1] or int(b[2])!=int(a[2])+1:continue
    if re.search(r'专题[一二三四五六七八九十\d]|第[一二三四五六七八九十\d]+章',q['raw'][:210]):continue
    if p['modules'] and q['modules'] and not p['modules']&q['modules']:continue
    tail=p['raw'][-380:];head=q['raw'][:380];key=str(left)+'|'+str(right);joined[key]=tail+'\n\n'+head;mods[key]=p['modules']|q['modules'];origin[key]=(left,tail,right,head)
   self.joined=DefinitionCorpus('joined',joined,mods);self.joined_origin=origin
  hits=self.joined.find(fs,module);expanded=[]
  for h in hits:
   left,tail,right,head=self.joined_origin[h['page']];raw=tail+'\n\n'+head;start=raw.find(h['quote']);end=start+len(h['quote']);boundary=len(tail)
   if start<0 or not(start<boundary and end>boundary+2):continue
   for page,quote in [(left,raw[start:boundary].strip()),(right,raw[boundary+2:end].strip())]:
    if len(canon(quote))<8:continue
    expanded.append({**h,'page':page,'quote':quote,'method':'cross-page','note':'这一处讲解跨页，请连续查看对应原文。'})
  return expanded[:4]
 def recover(self,q,fs,module):
  def valid(h):
   answer=h.get('answer','');quote=canon(h['quote'])
   for verb in ['揭示','掩盖','决定','创造','消灭']:
    if verb in answer and verb not in quote:return False
   for neg in ['不是','不能','不可能','不会','不得']:
    if neg in answer and neg not in quote:return False
   if answer:
    best=max(difflib.SequenceMatcher(None,answer,quote,autojunk=False).get_matching_blocks(),key=lambda b:b.size);near=quote[max(0,best.b-3):best.b+best.size+3]
    if not re.search('不是|不能|不可能|不会|不得',answer) and re.search('不是|不能|不可能|不会|不得',near):return False
   return True
  return [h for h in self.find(fs,module) if valid(h)] or self.heading(q,module) or [h for h in self.continuation(fs,module) if valid(h)]

def read(p):return json.loads(p.read_text())
def dump(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
def main():
 native=r.corpora()
 for page,p in native['s'].pages.items():
  if 10<=int(page)<=53:p['modules']={'马克思主义基本原理'}
 corpora={k:DefinitionCorpus(k,{p:v['raw'] for p,v in c.pages.items()},{p:v['modules'] for p,v in c.pages.items()}) for k,c in native.items()};source_hash={}
 catalog=r.read('extra-lectures');data={'tj':{},'history':{}};modules={'tj':{},'history':{}}
 for source in catalog['sources']:
  with urllib.request.urlopen(source['dataUrl']+'?verify='+str(time.time_ns()),timeout=120) as f:doc=json.load(f)
  assert doc['source']['sha256']==source['sha256'];source_hash[source['id']]=source['sha256'];last=set()
  for p in doc['pages']:
   id=source['id'];pn=p['page'];kind='tj' if source['group']=='tuijie' else 'history'
   if kind=='tj' and (pn<(11 if id.endswith('upper') else 7) or id.endswith('upper') and pn in rc.TEST):continue
   if id.endswith('upper'):
    heading=canon(p['text'][:180])
    for name in ['马克思主义基本原理','毛泽东思想和中国特色社会主义理论体系概论','习近平新时代中国特色社会主义思想概论','中国近现代史纲要','思想道德与法治']:
     if canon(name) in heading:last={name};break
   key=id+':'+str(pn);data[kind][key]=p['text'];modules[kind][key]=last if id.endswith('upper') else set()
 corpora.update({k:DefinitionCorpus('extra',d,modules[k]) for k,d in data.items()});qs=r.pool();nm={};em={};counts=collections.Counter();added=[];unresolved=[];old_manual=r.read('manual-matches');prior_path=ROOT/'data/lecture-concept-recheck-report.json';prior=read(prior_path) if prior_path.exists() else {};prior_by_group=collections.defaultdict(list)
 for row in prior.get('added',[]):prior_by_group[row['group']].append(row)
 for i,q in enumerate(qs):
  g=rc.group(q);sig=r.signature(q)
  if g not in nm:
   nm[g]=r.read('lecture-links/'+g);em[g]=r.read('extra-links/'+g)
   for old in prior_by_group[g]:
    if old['kind'] in r.FIELDS:
     row=nm[g]['items'].get(old['id'],{});row[old['kind']]=[e for e in row.get(old['kind'],[]) if not any(e['page']==h['page'] and e['quote']==h['quote'] for h in old['evidence'])]
    else:
     row=em[g]['items'].get(old['id'],{});row['refs']=[e for e in row.get('refs',[]) if not any(e['source']+':'+str(e['page'])==h['page'] and e['quote']==h['quote'] for h in old['evidence'])]
  nr=nm[g]['items'].get(q['id'],{});er=em[g]['items'].get(q['id'],{});fs=None
  for kind in ['k','s','m','tj','history']:
   if kind=='history' and not rc.history(q):continue
   if kind in r.FIELDS:
    existing=q.get(r.FIELDS[kind]) or (nr.get(kind) if nr.get('sig')==sig else []) or (old_manual.get(q['id']) if kind=='m' else [])
    if kind=='m' and q.get('blockId'):existing=True
   else:
    refs=er.get('refs',[]) if er.get('sig')==sig else q.get('extraLectures',[]);existing=[x for x in refs if x['source'].startswith('tuijie-' if kind=='tj' else 'history-')]
   if existing:continue
   counts['before_'+kind]+=1
   if fs is None:fs=facts(q)
   found=corpora[kind].recover(q,fs,rc.subject(q))
   if not found:counts['after_'+kind]+=1;unresolved.append({'id':q['id'],'kind':kind});continue
   for e in found:assert e['quote'] in corpora[kind].pages[e['page']]['raw']
   if kind in r.FIELDS:
    row=nm[g]['items'].setdefault(q['id'],{'sig':sig});assert row['sig']==sig;row[kind]=[{k:e[k] for k in ['page','quote','note'] if k in e} for e in found]
   else:
    row=em[g]['items'].setdefault(q['id'],{'sig':sig,'refs':list(q.get('extraLectures',[]))});assert row['sig']==sig
    for e in found:
     src,pn=e['page'].split(':');row['refs'].append({'source':src,'page':int(pn),'quote':e['quote'],'method':e['method'],**({'note':e['note']} if e.get('note') else {})})
   counts['recovered_'+kind]+=1;added.append({'id':q['id'],'kind':kind,'group':g,'stem':q['stem'][:220],'evidence':found})
  if i%200==0:print('Reviewed',i,'/',len(qs),dict(counts),flush=True)
 for folder,maps in [('lecture-links',nm),('extra-links',em)]:
  for g,d in maps.items():d['version']=VERSION;dump(ROOT/'data'/folder/(g+'.json'),d)
 dump(ROOT/'data/lecture-concept-recheck-report.json',{'version':VERSION,'questions':len(qs),'counts':dict(counts),'added':added,'unresolved':unresolved,'sourceSha256':source_hash});print(dict(counts),flush=True)
if __name__=='__main__':main()
