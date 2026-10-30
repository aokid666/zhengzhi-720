"""Apply explicitly reviewed extra-lecture references after verifying original source text."""
import pathlib,json,urllib.request,time,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r);r.ROOT=ROOT
qs={q['id']:q for q in r.pool()};sources={s['id']:s for s in r.read('extra-lectures')['sources']};docs={};report=[]
for row in json.loads((ROOT/'scripts/extra-reference-reviewed.json').read_text()):
 q=qs[row['id']];assert row['stemContains'] in q['stem'];s=sources[row['source']]
 if s['id'] not in docs:
  with urllib.request.urlopen(s['dataUrl']+'?verify='+str(time.time_ns()),timeout=90) as response:docs[s['id']]=json.load(response)
 doc=docs[s['id']];assert s['sha256']==doc['source']['sha256'];assert row['quote'] in doc['pages'][row['page']-1]['text'];assert '提纲' in row['quote'] and '实践观' in row['quote']
 group=q.get('bookId') or ('manual' if q.get('source')=='m' else 'original');path=ROOT/'data/extra-links'/(group+'.json');d=json.loads(path.read_text());sig=r.signature(q);item=d['items'].setdefault(q['id'],{'sig':sig,'refs':[]});assert item['sig']==sig
 item['refs']=[ref for ref in item['refs'] if not(ref['source']==s['id'] and ref['page']==row['page'])];item['refs'].insert(0,{'source':s['id'],'page':row['page'],'quote':row['quote'],'method':'reviewed-original-table','note':row['note']});d['version']=135;path.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')));report.append({'id':q['id'],'sig':sig,'source':s['id'],'page':row['page'],'sourceSha256':s['sha256'],'quote':row['quote']})
(ROOT/'data/reviewed-extra-references-report.json').write_text(json.dumps({'version':135,'references':report},ensure_ascii=False,separators=(',',':')));print('Verified original table references:',len(report),flush=True)
