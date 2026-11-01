"""Apply individually read SuYi decisions; never promote material-only evidence."""
import argparse,collections,hashlib,importlib.util,json,pathlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];SID='suyi-manual-2027'
spec=importlib.util.spec_from_file_location('r',ROOT/'scripts/review-lecture-links.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
def read(p):return json.loads((ROOT/p).read_text())
def dump(p,x):(ROOT/p).write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
def main(document=None):
 s=next(s for s in read('data/extra-lectures.json')['sources'] if s['id']==SID)
 if document:d=json.loads(pathlib.Path(document).read_text())
 else:
  with urllib.request.urlopen(s['dataUrl'],timeout=90) as response:d=json.load(response)
 manifest=read('scripts/suyi-additional-reviewed.json');report=read('data/suyi-all-pairing-report.json');assert manifest['sourceSha256']==report['sourceSha256']==d['source']['sha256']==s['sha256'];qs={q['id']:q for q in r.pool()};rows={row['id']:row for row in report['items']};maps={}
 for decision in manifest['questions']:
  q=qs[decision['id']];row=rows[q['id']];assert decision['sig']==row['sig']==r.signature(q);assert len(decision['reasoning'])>=20;ids={u['id'] for u in row['units']};group=row['book']
  if group not in maps:maps[group]=read('data/extra-links/'+group+'.json')
  item=maps[group]['items'][q['id']];assert item['sig']==row['sig'];reviewed=set(item['suyiStatus'].get('reviewedUnits',[]))
  clear=set(decision.get('clearUnits',[]));row['covered']=[u for u in row['covered'] if u not in clear]
  for target in decision.get('removeReferences',[]):
   matches=lambda e:e['page']==target['page'] and e['quote']==target['quote']
   row['references']=[e for e in row['references'] if not matches(e)]
   item['refs']=[e for e in item['refs'] if not(e.get('source')==SID and matches(e))]
  for ref in decision['references']:
   raw=d['pages'][ref['page']-1]['text'];assert ref['quote'] in raw;assert set(ref['covers'])<=ids
   key=(ref['page'],ref['quote']);row['references']=[e for e in row['references'] if not(e.get('method')=='concept-reviewed' and (e['page'],e['quote'])==key)]
   row['references'].append({**ref,'relation':'manual-concept','method':'concept-reviewed','note':decision['reasoning'],'sourceTextSha256':hashlib.sha256(raw.encode()).hexdigest()})
   item['refs']=[e for e in item['refs'] if not(e.get('method')=='suyi-concept-reviewed' and (e['page'],e['quote'])==key)]
   item['refs'].append({'source':SID,'page':ref['page'],'quote':ref['quote'],'covers':ref['covers'],'method':'suyi-concept-reviewed','note':decision['reasoning']+' 已精读此考点；原图文字优先。'})
   row['covered']=list(dict.fromkeys(row['covered']+ref['covers']));reviewed.update(ref['covers'])
  row['status']='complete' if ids and set(row['covered'])==ids else 'partial' if row['covered'] else 'related' if row['references'] else 'unconfirmed';row.setdefault('manualConcepts',[])
  if decision['concept'] not in row['manualConcepts']:row['manualConcepts'].append(decision['concept'])
  item['suyiStatus'].update(status=row['status'],covered=row['covered'],uncovered=[u['id'] for u in row['units'] if u['id'] not in row['covered']],reviewedUnits=sorted(reviewed))
 for group,m in maps.items():m['version']=152;dump('data/extra-links/'+group+'.json',m)
 counts=collections.Counter();books=collections.defaultdict(collections.Counter)
 for row in report['items']:counts[row['status']]+=1;books[row['book']][row['status']]+=1
 report['version']=152;report['summary']=dict(counts);report['books']=dict(books);report['additionalManualDecisions']=len(manifest['questions']);dump('data/suyi-all-pairing-report.json',report);print(json.dumps(report['summary'],ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--document');a=p.parse_args();main(a.document)
