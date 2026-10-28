"""Recover missing references from explicit exam facts, retaining verbatim source evidence.

No page is added by chapter proximity or a generic topic alone. Existing references
and all question/user data stay untouched; the generated file is a versioned overlay.
"""
import argparse, collections, difflib, hashlib, json, math, pathlib, re, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = 128
ALIASES = [('马克思恩格斯', '马恩'), ('第一次合著', '第一次合作'), ('作品', '著作'),
           ('主要斗争形式','主要形式'), ('突出特点','特点'), ('三样法宝','三大法宝')]
QUALIFIERS = ['根本原因','根本目的','根本任务','根本保证','根本途径','根本要求','根本遵循',
              '根本特性','本质属性','基本国情','主要矛盾','主要形式','主要敌人','主要任务',
              '实践基础','思想基础','理论基础','理论来源','社会历史条件','历史条件','前提条件',
              '出发点','落脚点','首要问题','核心问题','中心任务','基本任务','首要任务','直接任务',
              '第一次','最早','唯一']
FIELDS = {'k': 'kPages', 's': 'sPages', 'm': 'mRefs'}

def read(name):
    return json.loads((ROOT / 'data' / (name + '.json')).read_text())

def norm(raw, mapping=False):
    chars, pos = [], []
    for i, c in enumerate(raw):
        for x in unicodedata.normalize('NFKC', c).lower():
            if re.match(r'[a-z0-9\u4e00-\u9fff]', x):
                chars.append(x); pos.append(i)
    t = ''.join(chars)
    for a, b in ALIASES:
        start = 0
        while (i := t.find(a, start)) >= 0:
            pos[i:i+len(a)] = [pos[i]] * len(b)
            t = t[:i] + b + t[i+len(a):]; start = i + len(b)
    return (t, pos) if mapping else t

def grams(t, n=5):
    return {t[i:i+n] for i in range(len(t)-n+1)}

def signature(q):
    parts = [q.get('module',''), q.get('stem',''), q.get('answer',''), q.get('cloze',{}).get('text','')]
    parts += [k + ':' + v for k,v in sorted(q.get('options',{}).items())]
    for side in ['left','right']:
        parts += [i['key'] + ':' + i['text'] for i in q.get(side,[])]
    parts += ['analysis:'+a.get('k','')+'='+a.get('t','') for a in q.get('analysis',[])]
    parts += ['map:'+k+'='+','.join(v) for k,v in sorted(q.get('matchMap',{}).items())]
    h = 2166136261
    # JS charCodeAt uses UTF-16 code units.
    raw = '\x1f'.join(parts).encode('utf-16-le')
    for i in range(0,len(raw),2):
        h = ((h ^ int.from_bytes(raw[i:i+2],'little')) * 16777619) & 0xffffffff
    return format(h,'08x')

def module_of(q):
    text = q.get('module','') + ' ' + q.get('chapter','')
    for name in ['马克思主义基本原理','毛泽东思想和中国特色社会主义理论体系概论','习近平新时代中国特色社会主义思想概论','中国近现代史纲要','思想道德与法治']:
        if name in text: return name
    return ''

def facts(q):
    result = []
    def add(prompt, answer, typ='pair'):
        p,a = norm(prompt),norm(answer)
        if len(a)>=1 and len(p+a)>=8:
            result.append((p,a,typ))
    if q.get('type') == 'matching':
        right = {x['key']:x['text'] for x in q['right']}
        for x in q['left']:
            for k in q['matchMap'][x['key']]: add(x['text'],right[k])
    elif q.get('type') == 'cloze':
        c=q['cloze']; hidden={i for m in c['masks'] for i in m['indices']}
        prompt=''.join(ch for i,ch in enumerate(c['text']) if i not in hidden)
        for m in c['masks']: add(prompt,m['text'])
    else:
        for k in q.get('answer',''):
            a=q.get('options',{}).get(k,'')
            if a not in ['正确','错误']: add(q['stem'][-400:],a)
        if q.get('exerciseKind')=='judgement' and q.get('answer')=='A': add('',q['stem'],'explanation')
        analysis_count=0
        for a in q.get('analysis',[]):
            for sentence in re.split(r'[。；;\n]',a.get('t','')):
                if 14<=len(norm(sentence))<=240 and not re.search(r'错误|不正确|排除|选项|故答案|干扰项|原书标记',sentence):
                    if analysis_count<4:
                        add('',sentence,'explanation');analysis_count+=1
    return list(dict.fromkeys(result))

class Corpus:
    def __init__(self, kind, data, modules):
        self.kind=kind; self.pages={}; self.ix=collections.defaultdict(set);self.exact_df={}
        for page, raw in data.items():
            if kind in ['k','s'] and int(page)<=9:continue # Covers, preface, and contents are not explanations.
            text,positions=norm(raw,True)
            if not text: continue
            self.pages[page]={'raw':raw,'text':text,'positions':positions,'modules':modules.get(page,set())}
            for g in grams(text): self.ix[g].add(page)
        self.N=len(self.pages)

    def find(self, fs, module):
        found={}
        for prompt,answer,typ in fs:
            candidates=collections.Counter()
            for g in grams(prompt+answer):
                pages=self.ix.get(g,())
                if len(pages)>45: continue
                for page in pages: candidates[page]+=math.log(1+self.N/(1+len(pages)))
            for page,_ in candidates.most_common(12):
                p=self.pages[page]
                if module and p['modules'] and module not in p['modules']: continue
                text=p['text']
                # Restrict each proof to a bounded source passage, not two distant
                # occurrences of a generic answer and an unrelated question cue.
                seeds=[]
                if len(answer)>=5:
                    for g in sorted((g for g in grams(answer) if g in self.ix),key=lambda g:(len(self.ix[g]),g))[:16]:
                        pos=text.find(g)
                        while pos>=0:
                            seeds.append(max(0,pos-115)); pos=text.find(g,pos+len(g))
                else:
                    for g in sorted((g for g in grams(prompt) if g in self.ix),key=lambda g:(len(self.ix[g]),g))[:12]:
                        pos=text.find(g)
                        if pos>=0: seeds.append(max(0,pos-100))
                for start in list(dict.fromkeys((x//48)*48 for x in seeds))[:8]:
                    end=min(len(text),start+320);window=text[start:end]
                    ab=[b for b in difflib.SequenceMatcher(None,answer,window,autojunk=False).get_matching_blocks() if b.size>=min(3,len(answer))]
                    pb=[b for b in difflib.SequenceMatcher(None,prompt,window,autojunk=False).get_matching_blocks() if b.size>=4]
                    am=max((b.size for b in ab),default=0);pm=max((b.size for b in pb),default=0)
                    ac=sum(b.size for b in ab)/max(1,len(answer));pc=sum(b.size for b in pb)/max(1,len(prompt))
                    # A distinctive intact statement is evidence in its own right.
                    long_proof=am>=18 and (ac>=.55 or am>=26)
                    if len(answer)>=10 and answer in window and answer not in self.exact_df:
                        self.exact_df[answer]=sum(answer in self.pages[pg]['text'] for pg in self.ix.get(answer[:5],()))
                    phrase_proof=typ=='pair' and len(answer)>=10 and answer in window and self.exact_df.get(answer,999)<=8
                    pair_proof=(am>=min(7,len(answer)) and ac>=.62 and pm>=6 and (pc>=.30 or pm>=12))
                    if len(answer)<=3: pair_proof=am==len(answer) and pm>=8 and pc>=.45
                    if not (long_proof or pair_proof or phrase_proof): continue
                    if typ=='explanation' and not long_proof: continue
                    best_answer=max(ab,key=lambda b:b.size)
                    near_prompt=[b for b in pb if b.size>=max(4,pm*.65) and abs(b.b-best_answer.b)<=100]
                    if not (long_proof or phrase_proof) and not near_prompt: continue
                    if typ=='pair':
                        qualifiers=[a for a in QUALIFIERS if a in prompt]
                        qualifiers=[a for a in qualifiers if not any(a!=b and a in b for b in qualifiers)]
                        # Same answer in a nearby list is not enough: "main enemy"
                        # and "main form" (or historical conditions / practical
                        # foundations) are different examinable relationships.
                        if qualifiers and not any(any(abs(m.start()-best_answer.b)<=100 for m in re.finditer(re.escape(a),window)) for a in qualifiers): continue
                        if len(answer)<=5 and len(self.ix.get(answer[:5],()))>30 and pm<12: continue
                    if len(answer)==1 and not re.search(r'(^|[^\u4e00-\u9fff])'+re.escape(answer)+r'([^\u4e00-\u9fff]|$)',p['raw']): continue
                    blocks=[best_answer]+sorted(near_prompt,key=lambda b:-b.size)[:1]
                    lo=min(b.b for b in blocks);hi=max(b.b+b.size for b in blocks)
                    if hi-lo>280: continue
                    # Three short, frequent fragments never become a proof merely
                    # because they appear on a page about the same broad subject.
                    distinctive=max((math.log(1+self.N/(1+len(self.ix.get(window[b.b:b.b+5],())))) for b in ab+pb if b.size>=5),default=0)
                    if distinctive<1.8: continue
                    a=p['positions'][start+max(0,lo-35)];z=p['positions'][start+min(len(window)-1,hi+45)]+1
                    # Complete the source lines instead of starting halfway
                    # through a heading or clipping a definition's final word.
                    line_start=p['raw'].rfind('\n',0,a)
                    if a-line_start<85:a=line_start+1
                    line_end=p['raw'].find('\n',z)
                    if line_end>=0 and line_end-z<85:z=line_end
                    quote=p['raw'][a:z].strip()
                    if len(re.findall(r'[A-D][.．、]',quote))>=3: continue
                    strength=am*1.5+pm*.7+ac*8+pc*5+distinctive
                    evidence={'page':page,'quote':quote,'answer':answer,'prompt':prompt[:180],
                              'answerRun':am,'promptRun':pm,'method':'statement' if long_proof else 'answer-phrase' if phrase_proof else 'question-answer',
                              'score':round(strength,2)}
                    if page not in found or strength>found[page]['score']: found[page]=evidence
        return sorted(found.values(),key=lambda e:-e['score'])[:2]

def corpora():
    toc=read('toc');k=read('lecture-k');s=read('lecture-s');mi=read('manual-index')
    km={};starts=sorted((x['page']+8,x['title']) for x in toc['k'] if x.get('mod'))
    for page in k:
        before=[title for start,title in starts if start<=int(page)]
        km[page]={before[-1]} if before else {'front-matter'}
    mm=collections.defaultdict(set)
    for topic in mi['topics']:
        if topic['module'] in {name for _,name in starts}:
            for page in topic['pages']: mm[page].add(topic['module'])
    manual={p['id']:p['text'] for p in mi['pages'] if not (p['vol']=='lower' and 17<=p['page']<=65) and (p['vol']!='upper' or p['page']>=9)}
    return {'k':Corpus('k',k,km),'s':Corpus('s',s,{}),'m':Corpus('m',manual,mm)}

def pool():
    return read('questions')+read('topical-exercises')+read('manual-questions')+read('manual-study')['questions']+[
        q for b in read('practice-index')['books'] for q in read('practice/'+b['id'])['questions']]

def reviewed_passages(corpora, questions):
    rows=json.loads((ROOT/'scripts/lecture-reference-reviewed.json').read_text());result=collections.defaultdict(lambda:collections.defaultdict(list))
    byid={q['id']:q for q in questions}
    for row in rows:
        q=byid[row['id']];assert row['stemContains'] in q['stem']
        raw=corpora[row['kind']].pages[row['page']]['raw'];start=raw.index(row['start'])
        end=raw.index(row['until'],start+len(row['start'])) if row.get('until') else min(len(raw),start+row['length'])
        quote=raw[start:end].strip();assert quote
        result[row['id']][row['kind']].append({'page':row['page'],'quote':quote,'note':row['note'],
            'method':'reviewed-passage','score':1000,'answer':'','prompt':'','answerRun':0,'promptRun':0})
    return result

def build():
    cs=corpora();old_manual=read('manual-matches');items={};counts=collections.defaultdict(collections.Counter)
    unresolved=[]
    qs=pool();reviewed=reviewed_passages(cs,qs)
    for i,q in enumerate(qs):
        row={'sig':signature(q)};fs=None
        for kind,field in FIELDS.items():
            old=q.get(field) or (old_manual.get(q['id'],[]) if kind=='m' else [])
            if old or (kind=='m' and q.get('blockId')):continue
            group=q.get('bookId') or ('original' if not q.get('source') else 'manual')
            counts[group]['missing_'+kind]+=1
            if fs is None:fs=facts(q)
            hits=reviewed[q['id']].get(kind) or cs[kind].find(fs,module_of(q))
            if hits:
                row[kind]=hits;counts[group]['recovered_'+kind]+=1
            else:unresolved.append({'id':q['id'],'kind':kind,'module':q.get('module'),'stem':q['stem'][:140]})
        if len(row)>1:items[q['id']]=row
        if i%100==0:print('Reviewed',i,'/',len(qs),flush=True)
    result={'version':VERSION,'items':items,'summary':dict(counts)}
    out=ROOT/'data/lecture-links.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    # The full audit stays available for reproducibility; browsers fetch only
    # the small supplement for the book currently being studied.
    groups={q.get('bookId') or ('manual' if q.get('source')=='m' else 'original'):{} for q in qs}
    for q in qs:
        if q['id'] not in items:continue
        group=q.get('bookId') or ('manual' if q.get('source')=='m' else 'original');row=items[q['id']]
        groups[group][q['id']]={'sig':row['sig'],**{k:[{name:e[name] for name in ['page','quote','note'] if name in e} for e in row[k]] for k in FIELDS if k in row}}
    outdir=ROOT/'data/lecture-links';outdir.mkdir(exist_ok=True)
    for group,rows in groups.items():(outdir/(group+'.json')).write_text(json.dumps({'version':VERSION,'items':rows},ensure_ascii=False,separators=(',',':')))
    report={'version':VERSION,'questions':len(qs),'linkedQuestions':len(items),'summary':dict(counts),'unresolved':unresolved,
            'sourceSha256':{n:hashlib.sha256((ROOT/'data'/f'{n}.json').read_bytes()).hexdigest() for n in ['lecture-k','lecture-s','manual-index']}}
    (ROOT/'data/lecture-links-report.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'linkedQuestions':len(items),'summary':dict(counts)},ensure_ascii=False),flush=True)

if __name__=='__main__':
    build()
