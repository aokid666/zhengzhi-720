"""Incrementally recheck visible missing lecture panels against verbatim source text.
Preserve all existing guarded overlays, questions, IDs and user state. Run on GitHub.
"""
import pathlib,json,re,collections,difflib,math,urllib.request,time,importlib.util,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r);r.ROOT=ROOT
VER=134
TEST={19,20,31,32,38,43,53,54,58,86,87,98,99,104,119,120,131,132,143,144,157,158,181,182,194,195,208,209,221,222,234,235,244,245}
def read(p):return json.loads(p.read_text())
def dump(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
def group(q):return q.get('bookId') or ('manual' if q.get('source')=='m' else 'original')
def subject(q):
 if q.get('subject'):return q['subject']
 prompt=r.norm(q.get('stem',''))
 if '新时代中国特色社会主义思想' in prompt and '世界观和方法论' in prompt:return '习近平新时代中国特色社会主义思想概论'
 return r.module_of(q)
def history(q):return bool(re.search('史纲|近现代史|毛中特|毛泽东思想',q.get('module','')+' '+q.get('chapter','')+' '+q.get('subject','')))
def extra_facts(q):
 fs=list(r.facts(q));stem=r.norm(q.get('stem','')+' '+q.get('cloze',{}).get('text',''));selected=[r.norm(q.get('options',{}).get(k,'')) for k in q.get('answer','') if q.get('options',{}).get(k) not in ['正确','错误']];anchors=[a for a in selected if len(a)>=4] or [stem]
 # Pedagogical labels must not become part of a definition; preserve the actual
 # subject and predicate, and do not extract intentionally incorrect options.
 for entry in q.get('analysis',[]):
  for line in re.split('[。；;\n]',entry.get('t','')):
   clean=re.split('技巧助背|口诀助背|联想助背|画图助背|提示[：:]|注意[：:]',line)[0]
   clean=re.sub(r'^\s*[·》>①-⑳（(\d）).、\s]+','',clean);a=r.norm(clean)
   if not 8<=len(a)<=200 or re.search('错误|不正确|排除|干扰项|选项|未找到|没找到|扫码|仅供|请结合|本题考|[A-DＡ-Ｄ]项|×',clean):continue
   if not any(r.grams(a,min(5,len(x)))&r.grams(x,min(5,len(x))) for x in anchors):continue
   fs.append((stem[-400:],a,'pair'))
 return list(dict.fromkeys(fs))
class RecheckCorpus(r.Corpus):
 def short_definitions(self,fs,module):
  hits={}
  for prompt,answer,typ in fs:
   if not prompt or not 8<=len(answer)<=55 or re.search('不是|不能|没有|不可能|并非|不得|不具有',answer):continue
   definition=re.fullmatch(r'(.{2,18}?)是(.{5,35})',answer)
   if not definition or definition[1] in ['它们','这些','其中','任何','一个','我们'] or definition[1] not in prompt:continue
   candidates=collections.Counter()
   for g in r.grams(answer):
    pages=self.ix.get(g,())
    if len(pages)>8:continue
    for p in pages:candidates[p]+=1
   for pn,_ in candidates.most_common(8):
    p=self.pages[pn]
    if module and p['modules'] and module not in p['modules']:continue
    text=p['text'];ab=difflib.SequenceMatcher(None,answer,text,autojunk=False).get_matching_blocks();best=max(ab,key=lambda b:b.size)
    if best.size<8 or best.size/len(answer)<.8:continue
    fragment=text[best.b:best.b+best.size]
    df=sum(fragment in self.pages[x]['text'] for x in self.ix.get(fragment[:5],()))
    if df>3:continue
    lo=max(0,best.b-65);hi=min(len(text),best.b+best.size+65);window=text[lo:hi];pb=difflib.SequenceMatcher(None,prompt,window,autojunk=False).get_matching_blocks();pm=max(b.size for b in pb)
    if pm<4:continue
    pred=definition[2];where=text.find(pred,lo,hi)
    if where<0 or definition[1] not in text[max(0,where-60):where]:continue
    qualifiers=[x for x in r.QUALIFIERS if x in answer or x in prompt[-90:]]
    if qualifiers and not any(x in window for x in qualifiers):continue
    # Reject an opposite statement surrounding an otherwise matching predicate.
    near=text[max(0,best.b-4):best.b+best.size+4]
    if re.search('不是|不能|没有|并非|不得|不具有',near):continue
    a=p['positions'][lo];z=p['positions'][hi-1]+1;start=p['raw'].rfind('\n',0,a);end=p['raw'].find('\n',z);quote=p['raw'][start+1:end if end>=0 else z].strip()
    if len(re.findall(r'[A-D][.．、]',quote))>=3:continue
    score=best.size+pm
    e={'page':pn,'quote':quote,'method':'short-definition','answer':answer,'prompt':prompt[:180],'answerRun':best.size,'promptRun':pm,'score':score}
    if pn not in hits or score>hits[pn]['score']:hits[pn]=e
  return sorted(hits.values(),key=lambda e:-e['score'])[:2]
 def recover(self,fs,module):return self.find(fs,module) or self.short_definitions(fs,module)

def main():
 native=r.corpora();corpora={k:RecheckCorpus(k,{p:v['raw'] for p,v in c.pages.items()},{p:v['modules'] for p,v in c.pages.items()}) for k,c in native.items()}
 catalog=r.read('extra-lectures');ed={'tj':{},'history':{}};source_hash={n:hashlib.sha256((ROOT/'data'/f'{n}.json').read_bytes()).hexdigest() for n in ['lecture-k','lecture-s','manual-index']}
 for s in catalog['sources']:
  url=s['dataUrl']+'?verify='+str(time.time_ns())
  with urllib.request.urlopen(url,timeout=120) as f:d=json.load(f)
  source_hash[s['id']]=d['source']['sha256'];assert d['source']['sha256']==s['sha256']
  for p in d['pages']:
   if s['group']=='tuijie' and (p['page']<(11 if s['id'].endswith('upper') else 7) or s['id'].endswith('upper') and p['page'] in TEST):continue
   ed['tj' if s['group']=='tuijie' else 'history'][s['id']+':'+str(p['page'])]=p['text']
 corpora.update({k:RecheckCorpus('extra',v,{}) for k,v in ed.items()});old_manual=r.read('manual-matches');qs=r.pool();native_maps={};extra_maps={};counts=collections.Counter();prior_path=ROOT/'data/lecture-recheck-report.json';prior=read(prior_path) if prior_path.exists() else {};rejected=prior.get('added',[]);added=[];unresolved=[]
 for qi,q in enumerate(qs):
  g=group(q)
  if g not in native_maps:
   native_maps[g]=r.read('lecture-links/'+g);extra_maps[g]=r.read('extra-links/'+g)
   # Re-evaluate only our own additions from the prior audit; preserve the original links.
   for old in [x for x in rejected if x['group']==g]:
    if old['kind'] in r.FIELDS:
     row=native_maps[g]['items'].get(old['id'],{});row[old['kind']]=[e for e in row.get(old['kind'],[]) if not any(e['page']==h['page'] and e['quote']==h['quote'] for h in old['evidence'])]
    else:
     row=extra_maps[g]['items'].get(old['id'],{});row['refs']=[e for e in row.get('refs',[]) if not any(e['source']+':'+str(e['page'])==h['page'] and e['quote']==h['quote'] for h in old['evidence'])]
  sig=r.signature(q);nr=native_maps[g]['items'].get(q['id'],{});er=extra_maps[g]['items'].get(q['id'],{});fs=None
  for kind in ['k','s','m','tj','history']:
   if kind=='history' and not history(q):continue
   if kind in r.FIELDS:
    old=q.get(r.FIELDS[kind]) or (nr.get(kind) if nr.get('sig')==sig else []) or (old_manual.get(q['id']) if kind=='m' else [])
    if kind=='m' and (q.get('blockId') or q.get('source')=='m' and q.get('qRefs')):old=True
   else:
    ex=er.get('refs',[]) if er.get('sig')==sig else q.get('extraLectures',[]);old=[e for e in ex if e['source'].startswith('tuijie-' if kind=='tj' else 'history-')]
   if old:continue
   counts['before_'+kind]+=1
   if fs is None:fs=extra_facts(q)
   hits=corpora[kind].recover(fs,subject(q) if kind in r.FIELDS else '')
   if not hits:counts['after_'+kind]+=1;unresolved.append({'id':q['id'],'kind':kind,'subject':subject(q),'stem':q['stem'][:160]});continue
   # All evidence is a verbatim slice of the appropriate original source.
   assert all(h['quote'] in corpora[kind].pages[h['page']]['raw'] for h in hits)
   if kind in r.FIELDS:
    row=native_maps[g]['items'].setdefault(q['id'],{'sig':sig});assert row['sig']==sig;row[kind]=[{k:h[k] for k in ['page','quote']} for h in hits]
   else:
    row=extra_maps[g]['items'].setdefault(q['id'],{'sig':sig,'refs':list(q.get('extraLectures',[]))});assert row['sig']==sig
    for h in hits:
     src,pn=h['page'].split(':');row['refs'].append({'source':src,'page':int(pn),'quote':h['quote'],'method':h['method']})
   counts['recovered_'+kind]+=1;added.append({'id':q['id'],'kind':kind,'group':g,'stem':q['stem'][:220],'answer':q.get('answer',''),'evidence':hits})
  if qi%200==0:print('Reviewed',qi,'/',len(qs),dict(counts),flush=True)
 for folder,maps in [('lecture-links',native_maps),('extra-links',extra_maps)]:
  for g,d in maps.items():d['version']=VER;dump(ROOT/'data'/folder/(g+'.json'),d)
 for kind in ['k','s','m','tj','history']:
  counts['before_'+kind]=prior.get('counts',{}).get('before_'+kind,counts['before_'+kind]);counts['recovered_'+kind]=sum(x['kind']==kind for x in added);counts['after_'+kind]=counts['before_'+kind]-counts['recovered_'+kind]
 report={'version':VER,'questions':len(qs),'counts':dict(counts),'added':added,'unresolved':unresolved,'sourceSha256':source_hash};dump(ROOT/'data/lecture-recheck-report.json',report);print(json.dumps(dict(counts)),flush=True)
if __name__=='__main__':main()
