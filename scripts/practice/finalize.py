from pathlib import Path
exec((Path(__file__).with_name('build.py')).read_text())
assert not errors, 'All extracted question/answer validation errors must be resolved'
# High-precision original-source references: identical uncommon 12-character phrases.
docs={k:json.loads((R/'data'/f'lecture-{k}.json').read_text()) for k in ['k','s']};docs['m']={p['id']:p['text'] for p in json.loads((R/'data/manual-index.json').read_text())['pages']}
indexes={}
for kind,d in docs.items():
 ix=collections.defaultdict(set)
 for key,text in d.items():
  text=norm(text)
  for n in range(max(0,len(text)-11)):ix[text[n:n+12]].add(key)
 indexes[kind]=ix
out=R/'data/practice';out.mkdir(exist_ok=True);books=[]
for src in sources:
 b=src['id'];qs=results[b];pages=layouts[b]
 for q in qs:
  query=q['stem']+'\n'+'\n'.join(q['options'].get(k,'') for k in q['answer'])
  if q['type']=='matching':query='\n'.join(i['text'] for i in q['left'])+'\n'+'\n'.join(i['text'] for i in q['right'])
  query=norm(query);grams={query[n:n+12] for n in range(max(0,len(query)-11))}
  for kind,ix in indexes.items():
   scores=collections.Counter()
   for g in grams:
    keys=ix.get(g,[])
    if len(keys)<=4:scores.update(keys)
   hits=[key for key,count in scores.most_common(2) if count>=6];q[{'k':'kPages','s':'sPages','m':'mRefs'}[kind]]=list(map(int,hits)) if kind!='m' else hits
  q['referenceMethod']='相同原文片段匹配，阅读时请核对语境。'
 counts=collections.Counter(q['type'] for q in qs);chapters=[]
 for q in qs:
  key=q['module']+' · '+q['chapter']
  if not any(c['key']==key for c in chapters):chapters.append({'key':key,'title':key,'firstPage':q['qRefs'][0]['page'],'count':0})
  next(c for c in chapters if c['key']==key)['count']+=1
 # Include full-page reading and source-only search without mixing question searches.
 payload={'bookId':b,'questions':qs,'pages':[{'page':p['page'],'width':p['width'],'height':p['height'],'text':p['text']} for p in pages]}
 (out/f'{b}.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
 books.append(dict(src,count=len(qs),counts=dict(counts),chapters=chapters,kind='notes' if b.startswith('cf') else 'daily' if b=='xu-daily' else 'matching',pageSizes=[{'width':p['width'],'height':p['height']} for p in pages]))
(R/'data/practice-index.json').write_text(json.dumps({'version':112,'sourceBase':'https://aokid666.github.io/zz-sprint-practice-2027/','books':books,'total':sum(len(qs) for qs in results.values())},ensure_ascii=False,separators=(',',':')))
print('Written',sum(map(len,results.values())),'validated questions')
