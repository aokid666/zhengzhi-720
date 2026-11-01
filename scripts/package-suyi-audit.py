"""Validate cloud evidence; compact reader metadata without touching old references."""
import argparse,collections,hashlib,importlib.util,json,pathlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];SID='suyi-manual-2027'
spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
def read(p):return json.loads((ROOT/p).read_text())
def dump(p,x):(ROOT/p).write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
def run(document=None,check=False):
 a=read('data/suyi-all-pairing-report.json');source=next(s for s in read('data/extra-lectures.json')['sources'] if s['id']==SID)
 if document:d=json.loads(pathlib.Path(document).read_text())
 else:
  with urllib.request.urlopen(source['dataUrl'],timeout=90) as response:d=json.load(response)
 assert a['sourceSha256']==d['source']['sha256']==source['sha256'];qs={q['id']:q for q in r.pool()};assert len(qs)==len(a['items'])==a['questions'];assert {q['id'] for q in a['items']}==set(qs)
 maps={};summary=collections.Counter();books=collections.defaultdict(collections.Counter);items=[]
 for row in a['items']:
  q=qs[row['id']];assert row['sig']==r.signature(q)
  ids={u['id'] for u in row['units']};assert set(row['covered'])<=ids;assert len(row['covered'])==len(set(row['covered']))
  if row['status']=='complete':assert ids and set(row['covered'])==ids
  if row['status']=='partial':assert row['covered'] and set(row['covered'])!=ids
  if row['status']=='unconfirmed':assert not row['references'] and not row['covered']
  for ref in row['references']:
   text=d['pages'][ref['page']-1]['text'];assert ref['quote'] in text;assert ref['sourceTextSha256']==hashlib.sha256(text.encode()).hexdigest();assert set(ref['covers'])<=ids
  group=row['book']
  if group not in maps:maps[group]=read('data/extra-links/'+group+'.json')
  published=maps[group]['items'][row['id']];assert published['sig']==row['sig'];assert published['suyiStatus']['status']==row['status'];assert published['suyiStatus']['covered']==row['covered']
  for ref in row['references']:
   assert any(e['source']==SID and e['page']==ref['page'] and e['quote']==ref['quote'] for e in published['refs'])
  summary[row['status']]+=1;books[group][row['status']]+=1
  stem=q['stem'];preview=stem if len(stem)<=320 else stem[:140]+'……'+stem[-160:]
  items.append({'id':q['id'],'book':group,'module':q.get('module',''),'chapter':q.get('chapterTitle') or q.get('chapter',''),'stem':preview,'status':row['status'],'unitCount':len(ids),'coveredCount':len(row['covered'])})
 assert dict(summary)==a['summary'];assert dict(books)==a['books']
 compact={'version':151,'source':SID,'questions':len(items),'summary':dict(summary),'books':dict(books),'items':items}
 path='data/suyi-pairing-status.json'
 if check:assert read(path)==compact
 else:dump(path,compact)
 print(json.dumps({'questions':len(items),'summary':dict(summary),'compactBytes':len(json.dumps(compact,ensure_ascii=False).encode())},ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--document');p.add_argument('--check',action='store_true');a=p.parse_args();run(a.document,a.check)
