"""Recover missing references from explicit exam facts, retaining verbatim source evidence.

No page is added by chapter proximity or a generic topic alone. Existing references
and all question/user data stay untouched; the generated file is a versioned overlay.
"""
import argparse, collections, difflib, hashlib, json, math, pathlib, re, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = 128
ALIASES = [('马克思恩格斯', '马恩'), ('第一次合著', '第一次合作'), ('作品', '著作')]
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
        self.kind=kind; self.pages={}; self.ix=collections.defaultdict(set)
        for page, raw in data.items():
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
                    pair_proof=(am>=min(7,len(answer)) and ac>=.62 and pm>=6 and (pc>=.30 or pm>=12))
                    if len(answer)<=3: pair_proof=am==len(answer) and pm>=10 and pc>=.35
                    if not (long_proof or pair_proof): continue
                    if typ=='explanation' and not long_proof: continue
                    if len(answer)==1 and not re.search(r'(^|[^\u4e00-\u9fff])'+re.escape(answer)+r'([^\u4e00-\u9fff]|$)',p['raw']): continue
                    blocks=ab+pb;lo=min(b.b for b in blocks);hi=max(b.b+b.size for b in blocks)
                    if hi-lo>280: continue
                    # Three short, frequent fragments never become a proof merely
                    # because they appear on a page about the same broad subject.
                    distinctive=max((math.log(1+self.N/(1+len(self.ix.get(window[b.b:b.b+5],())))) for b in ab+pb if b.size>=5),default=0)
                    if distinctive<1.8: continue
                    a=p['positions'][start+max(0,lo-22)];z=p['positions'][start+min(len(window)-1,hi+28)]+1
                    quote=p['raw'][a:z].strip()
                    if len(re.findall(r'[A-D][.．、]',quote))>=3: continue
                    strength=am*1.5+pm*.7+ac*8+pc*5+distinctive
                    evidence={'page':page,'quote':quote,'answer':answer,'prompt':prompt[:180],
                              'answerRun':am,'promptRun':pm,'method':'statement' if long_proof else 'question-answer',
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

def build():
    cs=corpora();old_manual=read('manual-matches');items={};counts=collections.defaultdict(collections.Counter)
    unresolved=[]
    qs=pool()
    for i,q in enumerate(qs):
        row={'sig':signature(q)};fs=None
        for kind,field in FIELDS.items():
            old=q.get(field) or (old_manual.get(q['id'],[]) if kind=='m' else [])
            if old or (kind=='m' and q.get('blockId')):continue
            group=q.get('bookId') or ('original' if not q.get('source') else 'manual')
            counts[group]['missing_'+kind]+=1
            if fs is None:fs=facts(q)
            hits=cs[kind].find(fs,module_of(q))
            if hits:
                row[kind]=hits;counts[group]['recovered_'+kind]+=1
            else:unresolved.append({'id':q['id'],'kind':kind,'module':q.get('module'),'stem':q['stem'][:140]})
        if len(row)>1:items[q['id']]=row
        if i%100==0:print('Reviewed',i,'/',len(qs),flush=True)
    result={'version':VERSION,'items':items,'summary':dict(counts)}
    out=ROOT/'data/lecture-links.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    report={'version':VERSION,'questions':len(qs),'linkedQuestions':len(items),'summary':dict(counts),'unresolved':unresolved,
            'sourceSha256':{n:hashlib.sha256((ROOT/'data'/f'{n}.json').read_bytes()).hexdigest() for n in ['lecture-k','lecture-s','manual-index']}}
    (ROOT/'data/lecture-links-report.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'linkedQuestions':len(items),'summary':dict(counts)},ensure_ascii=False),flush=True)

if __name__=='__main__':
    build()
