"""Publish question-by-question reading decisions, never infer new page assignments.

The review manifest records an explicit exam concept, reasoning and verbatim
passages selected after reading. This program only validates and applies them.
"""
import copy,hashlib,importlib.util,json,pathlib,urllib.request,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r);r.ROOT=ROOT
VERSION=144
def read(path):return json.loads((ROOT/path).read_text())
def write(path,value):
 p=ROOT/path;value=json.dumps(value,ensure_ascii=False,separators=(',',':'))
 if p.read_text()!=value:p.write_text(value)
def digest(text):return hashlib.sha256(text.encode()).hexdigest()
def original_question(q,correction):
 original=copy.deepcopy(q)
 if correction:
  assert q['module'] in (correction['from'],correction['to']),(q['id'],'module changed independently')
  original['module']=correction['from']
 return original
def verify_quote(ref,documents):
 page=str(ref['page']);raw=documents[ref['kind']][page]
 assert ref['quote'] and ref['quote'] in raw,(ref['kind'],page,'source passage changed')
 return digest(raw)
def remove_reviewed_references(current,targets,identity):
 """Remove only the exact audited snapshots; reject independently edited targets."""
 result=list(current)
 for target in targets:
  if target in result:result.remove(target)
  else:assert not any(identity(e)==identity(target) for e in result),'reference changed since reading'
 return result
def main():
 manifest=read('scripts/semantic-reference-reviewed.json')
 reference_corrections=manifest.get('referenceCorrections',[])
 corrections={x['id']:x for x in manifest['moduleCorrections']}
 qs={q['id']:q for q in r.pool()}
 # Check every reviewed question before making any in-memory change.
 for row in manifest['questions']+manifest['moduleCorrections']+reference_corrections:
  assert row['sig']==r.signature(original_question(qs[row['id']],corrections.get(row['id']))),(row['id'],'question changed since reading')
 docs={'k':read('data/lecture-k.json'),'s':read('data/lecture-s.json'),
       'm':{p['id']:p['text'] for p in read('data/manual-index.json')['pages']}}
 aliases={'tj-u':'tuijie-manual-upper'}
 needed={aliases.get(e['kind'],e['kind']) for row in manifest['questions'] for e in row['references'] if e['kind'] not in docs}
 needed.update(e['source'] for row in reference_corrections for e in row.get('removeExtra',[]))
 sources={s['id']:s for s in read('data/extra-lectures.json')['sources']}
 def fetch(sid):
  with urllib.request.urlopen(sources[sid]['dataUrl'],timeout=120) as response:d=json.load(response)
  assert d['source']['sha256']==sources[sid]['sha256'],(sid,'source identity changed')
  return sid,{str(p['page']):p['text'] for p in d['pages']}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for sid,pages in pool.map(fetch,sorted(needed)):docs['tj-u' if sid=='tuijie-manual-upper' else sid]=pages
 proof_hashes={}
 for row in manifest['questions']:
  q=qs[row['id']]
  assert row['concept'] and len(row['reasoning'])>=20
  for ref in row['references']:
   assert (ref['covers'] or ref.get('contextOnly')) and set(ref['covers'])<=set(q['answer']),(row['id'],'coverage is not a correct option')
   proof_hashes[(ref['kind'],ref['page'])]=verify_quote(ref,docs)
 # A module correction changes a signature: migrate only this approved field.
 banks={};maps={};extras={};changed_modules=[]
 def files(q):
  group=q.get('bookId') or ('manual' if q.get('source')=='m' else 'original')
  if group not in maps:
   maps[group]=read('data/lecture-links/'+group+'.json');extras[group]=read('data/extra-links/'+group+'.json')
  return group,maps[group],extras[group]
 for qid,c in corrections.items():
  q=qs[qid];group,native,extra=files(q);old=r.signature(original_question(q,c))
  q['module']=c['to'];new=r.signature(q)
  for overlay in (native,extra):
   if qid in overlay['items']:
    assert overlay['items'][qid]['sig'] in (old,new),(qid,'existing overlay signature')
    overlay['items'][qid]['sig']=new
  if group not in banks:banks[group]=read('data/practice/'+group+'.json')
  bankq=next(x for x in banks[group]['questions'] if x['id']==qid)
  before=copy.deepcopy(bankq);bankq['module']=c['to']
  assert {k:v for k,v in before.items() if k!='module'}=={k:v for k,v in bankq.items() if k!='module'}
  changed_modules.append({'id':qid,'from':c['from'],'to':c['to'],'reasoning':c['reasoning']})
 # Explicit, signature-bound corrections are the only exception to preserving other proofs.
 # The bank's original lists remain unchanged; the frontend clears only the audited list.
 reference_changes=[]
 for correction in reference_corrections:
  q=qs[correction['id']];_,native,extra=files(q);sig=r.signature(q)
  item=native['items'].setdefault(q['id'],{'sig':sig});assert item['sig']==sig
  evidence=[]
  for kind,decision in correction.get('clear',{}).items():
   assert q.get(r.FIELDS[kind],[])==decision['expected'],(q['id'],kind,'original pages changed since reading')
   assert kind not in item.get('replace',{}) and kind not in item.get('extend',{}),(q['id'],kind,'independent page correction exists')
   existing=item.setdefault('clear',{}).get(kind)
   assert existing is None or existing==decision,(q['id'],kind,'clear decision changed independently')
   item['clear'][kind]=copy.deepcopy(decision)
  for kind,targets in correction.get('removeOverlay',{}).items():
   for target in targets:
    sha=verify_quote({'kind':kind,**target},docs)
    evidence.append({'kind':kind,'page':target['page'],'quote':target['quote'],'pageTextSha256':sha})
   item[kind]=remove_reviewed_references(item.get(kind,[]),targets,lambda e:str(e['page']))
  other=extra['items'].get(q['id'])
  if correction.get('removeExtra'):
   assert other and other['sig']==sig
   for target in correction['removeExtra']:
    kind='tj-u' if target['source']=='tuijie-manual-upper' else target['source']
    sha=verify_quote({'kind':kind,**target},docs)
    evidence.append({'kind':target['source'],'page':target['page'],'quote':target['quote'],'pageTextSha256':sha})
   other['refs']=remove_reviewed_references(other.get('refs',[]),correction['removeExtra'],lambda e:(e['source'],str(e['page'])))
  reference_changes.append({'id':q['id'],'sig':sig,'reasoning':correction['reasoning'],'clear':correction.get('clear',{}),'rejectedReferences':evidence})
 # Replace only this workflow's own earlier excerpts when reading is refined.
 # Other decisions remain intact except the exact audited snapshots above.
 for row in manifest['questions']:
  _,native,extra=files(qs[row['id']])
  for kind in ('k','s','m'):
   item=native['items'].get(row['id'],{})
   if kind in item:item[kind]=[e for e in item[kind] if e.get('method')!='question-reviewed-reading']
  item=extra['items'].get(row['id'],{})
  if 'refs' in item:item['refs']=[e for e in item['refs'] if e.get('method')!='question-reviewed-reading']
 report=[];added=0
 for row in manifest['questions']:
  q=qs[row['id']];group,native,extra=files(q);sig=r.signature(q);panels={}
  for ref in row['references']:
   kind=ref['kind'];panel=kind if kind in ('k','s','m') else 'tj' if kind.startswith(('tj-','tuijie-')) else 'history'
   panels.setdefault(panel,[]).append(ref)
  for panel,refs in panels.items():
   covers=set(''.join(e['covers'] for e in refs));remaining=set(q['answer'])-covers
   assert covers,(q['id'],panel,'context alone cannot count as a matching explanation')
   complete=not remaining;status='完整选项依据' if complete else '部分选项依据'
   if row.get('evidenceMode')=='principle-application':status='原理应用依据'+('（部分选项）' if remaining else '')
   if row.get('answerMode')=='incorrect-statement':status='选错题的纠正依据'+('（部分选项）' if remaining else '')
   detail={'id':q['id'],'kind':panel,'concept':row['concept'],'reasoning':row['reasoning'],
           'covers':''.join(sorted(covers)),'notCovered':''.join(sorted(remaining)),'complete':complete,
           'evidenceMode':row.get('evidenceMode','direct-passage'),'answerMode':row.get('answerMode','correct-statement'),'pages':[]}
   for ref in refs:
    note='逐题复核｜'+status+'。考点：'+row['concept']+'。'+row['reasoning']
    note+=(' 本页提供前后文或表头，须与所列讲解页连读，不单独用于判定答案。' if ref.get('contextOnly') else ' 本页核对选项：'+ref['covers']+'。')
    if remaining:note+=' 本资料所列原文尚未完整展开选项'+''.join(sorted(remaining))+'，不能据此视为整题已全部覆盖。'
    proof={'page':ref['page'],'quote':ref['quote'],'note':note,'method':'question-reviewed-reading',
           'covers':ref['covers'],'partial':not complete,'contextOnly':bool(ref.get('contextOnly'))}
    overlay=native if panel in ('k','s','m') else extra
    item=overlay['items'].setdefault(q['id'],{'sig':sig})
    assert item['sig']==sig
    if panel in ('k','s','m'):
     assert panel not in item.get('clear',{}),(q['id'],panel,'cleared source needs an explicit new review')
     if q.get(r.FIELDS[panel]):
      # Bind additive reading to the exact original page list; do not change the bank.
      assert panel not in item.get('replace',{}),(q['id'],panel,'independent page correction requires review')
      item.setdefault('extend',{})[panel]=copy.deepcopy(q[r.FIELDS[panel]])
     dest=item.setdefault(panel,[])
     key=lambda e:(str(e['page']),e['quote'])
    else:
     proof['source']=aliases.get(ref['kind'],ref['kind']);proof['page']=int(ref['page']);dest=item.setdefault('refs',[])
     key=lambda e:(e['source'],str(e['page']),e['quote'])
    found=next((i for i,e in enumerate(dest) if key(e)==key(proof)),None)
    if found is None:dest.append(proof);added+=1
    elif dest[found].get('method')=='question-reviewed-reading':dest[found]=proof
    detail['pages'].append({'source':proof.get('source',panel),'page':proof['page'],'quote':proof['quote'],'contextOnly':bool(ref.get('contextOnly')),
                            'pageTextSha256':proof_hashes[(ref['kind'],ref['page'])]})
   report.append(detail)
 for group,d in banks.items():write('data/practice/'+group+'.json',d)
 for group,d in maps.items():d['version']=VERSION;write('data/lecture-links/'+group+'.json',d)
 for group,d in extras.items():d['version']=VERSION;write('data/extra-links/'+group+'.json',d)
 output={'version':VERSION,'reviewedQuestions':len(manifest['questions']),'reviewedPanels':len(report),
         'completePanels':sum(x['complete'] for x in report),'partialPanels':sum(not x['complete'] for x in report),
         'moduleCorrections':changed_modules,'referenceCorrections':reference_changes,'reviews':report}
 (ROOT/'data/semantic-reading-review-report.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')))
 print(json.dumps({k:v for k,v in output.items() if k not in ('moduleCorrections','referenceCorrections','reviews')},ensure_ascii=False))
 print('Verified original passages:',len(proof_hashes),'new reference pages:',added,'module corrections:',len(changed_modules))
if __name__=='__main__':main()
