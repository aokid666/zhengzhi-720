"""Audit every question against SuYi, publishing only bounded, source-verifiable facts.

Whole-bank computation runs in GitHub Actions. A hit is never called a manual
reading decision. Every answer/blank/link has independent coverage; written and
judgement corrections remain related evidence rather than complete solutions.
"""
import argparse,collections,copy,difflib,hashlib,importlib.util,json,pathlib,re,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];VERSION=148;SID='suyi-manual-2027'
spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
def read(p):return json.loads((ROOT/p).read_text())
def dump(p,x):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
def source():
 s=next(s for s in read('data/extra-lectures.json')['sources'] if s['id']==SID)
 with urllib.request.urlopen(s['dataUrl'],timeout=120) as response:d=json.load(response)
 assert s['sha256']==d['source']['sha256'];assert len(d['pages'])==246
 assert all(p['sha256']==s['pages'][p['page']-1]['sha256'] for p in d['pages'])
 return s,d
# Omit covers, directory, copyright and all tables mixing false distractors with
# corrections. Those remain available in the whole-book reader, not automatic proof.
def eligible(p):return 10<=p<=182 or 184<=p<=189 or 203<=p<=205 or 214<=p<=230 or 234<=p<=244
FALSE=re.compile(r'[（(]\s*[xX×✕]\s*[,，)）]|[×✕]|错误示例|错误表述')
def units(q):
 out=[];typ=q.get('type','choice')
 if typ=='matching':
  right={x['key']:x['text'] for x in q['right']}
  for x in q['left']:
   for k in q['matchMap'][x['key']]:out.append({'id':x['key']+'→'+k,'label':'连线 '+x['key']+'→'+k,'prompt':x['text'],'answer':right[k]})
 elif typ=='cloze':
  c=q['cloze'];text=c['text']
  for i,m in enumerate(c['masks']):
   indices=m.get('indices',[]);lo=max(0,min(indices)-100) if indices else 0;hi=min(len(text),max(indices)+101) if indices else len(text)
   out.append({'id':str(i+1),'label':'第'+str(i+1)+'空','prompt':''.join(ch for j,ch in enumerate(text[lo:hi],lo) if j not in set(indices)),'answer':m['text']})
 elif q.get('options') and q.get('answer'):
  for k in q['answer']:
   ans=q['options'].get(k,'')
   if ans and ans not in ['正确','错误','对','错']:out.append({'id':k,'label':'正确选项 '+k,'prompt':q['stem'][-500:],'answer':ans})
 return out
class Matcher:
 def __init__(self,d):
  self.doc=d;self.corpus=r.Corpus('suyi',{str(p['page']):p['text'] for p in d['pages'] if eligible(p['page'])},{})
  self.cache={}
 def find(self,prompt,answer,typ='pair'):
  key=(r.norm(prompt),r.norm(answer),typ)
  if key not in self.cache:self.cache[key]=self.corpus.find([key],'')
  return self.cache[key]
 def accepted(self,h,answer,prompt,typ='pair'):
  quote=h['quote'];a=r.norm(answer);p=r.norm(prompt);t=r.norm(quote)
  if FALSE.search(quote) or not a:return False
  # Entire short answers and complete long answer propositions must be present.
  if typ=='pair':
   if a not in t:return False
   if len(a)<8 and (h['promptRun']<10 or h['promptRun']<min(len(p)*.4,24)):return False
   if len(a)<4 and h['promptRun']<14:return False
  else:
   if h['answerRun']<24 or h['answerRun']<len(a)*.7:return False
  # Preserve negation and numerals, rather than accepting a near-identical opposite.
  if typ=='explanation' and any(w in a for w in ['不是','不能','不等于']):
   if a not in t:return False
  return True
 def question(self,q):
  us=units(q);proofs={};covered=[];related=[]
  def add(h,uid,kind):
   page=int(h['page']);key=(page,h['quote']);e=proofs.setdefault(key,{'page':page,'quote':h['quote'],'covers':[],'relation':kind,'answerRun':h['answerRun'],'promptRun':h['promptRun']})
   if uid is not None and uid not in e['covers']:e['covers'].append(uid)
  for u in us:
   hits=[h for h in self.find(u['prompt'],u['answer']) if self.accepted(h,u['answer'],u['prompt'])]
   if hits:add(hits[0],u['id'],'answer');covered.append(u['id'])
  # Supplemental explanation: supports a topic, never silently fills an uncovered
  # short answer or turns a written/judgement item into a complete-answer claim.
  if not proofs:
   for prompt,answer,typ in r.facts(q):
    if typ!='explanation':continue
    hits=[h for h in self.find(prompt,answer,typ) if self.accepted(h,answer,prompt,typ)]
    if hits:add(hits[0],None,'principle');related.append(answer)
    if len(proofs)>=2:break
  status='complete' if us and len(covered)==len(us) else 'partial' if covered else 'related' if proofs else 'unconfirmed'
  # Cap duplicate views, prioritizing distinct covered answers, not a whole page per option.
  refs=list(proofs.values());refs.sort(key=lambda e:(-len(e['covers']),-e['answerRun'],e['page']))
  return {'id':q['id'],'sig':r.signature(q),'book':q.get('bookId') or ('manual' if q.get('source')=='m' else 'original'),'status':status,'units':[{**u,'prompt':u['prompt'][:200],'answer':u['answer'][:350]} for u in us],'covered':covered,'references':refs,'module':q.get('module',''),'stem':q['stem'][:140]}
def shard(index,count,out):
 s,d=source();m=Matcher(d);qs=r.pool();rows=[]
 for n,q in enumerate(qs):
  if n%count!=index:continue
  rows.append(m.question(q))
  if len(rows)%25==0:print('shard',index,'processed',len(rows),flush=True)
 dump(out,{'sourceSha256':s['sha256'],'index':index,'count':count,'total':len(qs),'questions':rows});print('finished',index,len(rows),flush=True)
def finalize(directory):
 s,d=source();byid={q['id']:q for q in r.pool()};files=sorted(pathlib.Path(directory).glob('*.json'));pieces=[json.loads(p.read_text()) for p in files];assert pieces and len(pieces)==pieces[0]['count'];assert {p['index'] for p in pieces}==set(range(len(pieces)))
 rows=[row for piece in pieces for row in piece['questions']];assert len(rows)==len(byid) and {row['id'] for row in rows}==set(byid);assert all(piece['sourceSha256']==s['sha256'] for piece in pieces)
 # Previously read source passages take precedence. Their known option coverage is
 # explicitly recorded; an earlier partial decision stays partial.
 manual=read('data/suyi-reading-report.json');known=collections.defaultdict(list)
 for e in manual['items']:known[e['qid']].append(e)
 maps={};counts=collections.Counter();books=collections.defaultdict(collections.Counter)
 for row in rows:
  q=byid[row['id']];assert row['sig']==r.signature(q)
  if q['id'] in known:
   covered=list(q['answer']) if q['id'] not in manual['partialQuestions'] else ['A']
   row['references']=[{'page':e['page'],'quote':e['quote'],'covers':covered if e['page']!=71 else [],'relation':'manual','note':e['note']} for e in known[q['id']]]
   row['covered']=covered;row['status']='complete' if set(covered)==set(q['answer']) else 'partial';row['review']='manual'
  group=row['book']
  if group not in maps:maps[group]=read('data/extra-links/'+group+'.json')
  item=maps[group]['items'].setdefault(q['id'],{'sig':row['sig'],'refs':[]});assert item['sig']==row['sig']
  # Only regenerate this script's own references; preserve all independent proofs.
  item['refs']=[e for e in item['refs'] if e.get('method')!='suyi-verified-fact']
  for e in row['references']:
   pg=d['pages'][e['page']-1];assert e['quote'] in pg['text'];assert eligible(e['page'])
   e['sourceTextSha256']=hashlib.sha256(pg['text'].encode()).hexdigest()
   if row.get('review')=='manual':continue
   labels=[u['label'] for u in row['units'] if u['id'] in e['covers']]
   note=('原文固定搭配核验：'+ '、'.join(labels)+'。' if labels else '找到与本题解析相关的原理，尚未确认完整答案。')+'识别文字请对照原图核验。'
   item['refs'].append({'source':SID,'page':e['page'],'quote':e['quote'],'note':note,'method':'suyi-verified-fact','covers':e['covers']})
  item['suyiStatus']={k:row[k] for k in ['status','covered','units']};item['suyiStatus']['units']=[{'id':u['id'],'label':u['label']} for u in row['units']];item['suyiStatus']['manual']=row.get('review')=='manual';item['suyiStatus']['uncovered']=[u['id'] for u in row['units'] if u['id'] not in row['covered']]
  counts[row['status']]+=1;books[group][row['status']]+=1
 for group,mapping in maps.items():mapping['version']=VERSION;dump(ROOT/'data/extra-links'/f'{group}.json',mapping)
 report={'version':VERSION,'source':SID,'sourceSha256':s['sha256'],'questions':len(rows),'summary':dict(counts),'books':dict(books),'items':sorted(rows,key=lambda e:e['id']),'criteria':'Exact answer propositions and nearby question context; false-distractor tables excluded. Machine-verified evidence is not manual semantic review. Unconfirmed never means absent.'};dump(ROOT/'data/suyi-all-pairing-report.json',report)
 print(json.dumps({'questions':len(rows),'summary':dict(counts),'books':dict(books)},ensure_ascii=False),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True);s=sub.add_parser('shard');s.add_argument('--index',type=int,required=True);s.add_argument('--count',type=int,default=8);s.add_argument('--out',required=True);s=sub.add_parser('finalize');s.add_argument('--directory',required=True);a=p.parse_args();shard(a.index,a.count,a.out) if a.command=='shard' else finalize(a.directory)
