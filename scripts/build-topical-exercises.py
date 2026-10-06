#!/usr/bin/env python3
"""Transcribe the two topical exercises from the existing lecture OCR pages."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pages = json.loads((ROOT / 'data/lecture-s.json').read_text())


def clean_page(n):
    t = pages[str(n)]
    t = re.sub(r'【大李子专题总结(?:系列|资料)】\n?', '', t)
    t = re.sub(r'\n(?:1[0-7]\d)\s*$', '', t)
    return t.strip()


def flatten(t):
    return re.sub(r'\s*\n\s*', '', t).strip()


def extract(group, q_range, a_range, k_refs, s_refs):
    qtext = '\n'.join(clean_page(n) for n in q_range)
    marks = list(re.finditer(r'(?m)^(\d{1,2})、', qtext))
    atext = '\n'.join(clean_page(n) for n in a_range)
    amarks = list(re.finditer(r'<(\d{1,2})>\s*答案[：:]\s*([ABCD]+)', atext))
    assert len(marks) == len(amarks) == len(k_refs) == len(s_refs)
    result = []
    for i, (m, am) in enumerate(zip(marks, amarks)):
        number = i + 1
        assert int(m[1]) == int(am[1]) == number
        body = qtext[m.end():marks[i + 1].start() if i + 1 < len(marks) else len(qtext)]
        if i == len(marks) - 1:
            body = body.split('重点会议习题解析')[0].split('土地政策习题解析')[0]
        opts = list(re.finditer(r'(?m)^([ABCD])[.．、]', body))
        assert len(opts) == 4 and [x[1] for x in opts] == list('ABCD'), (group, number, body)
        stem = flatten(body[:opts[0].start()])
        options = {x[1]: flatten(body[x.end():opts[j + 1].start() if j < 3 else len(body)]) for j, x in enumerate(opts)}
        # The final option sometimes shares its page with the next section heading.
        options['D'] = flatten(re.split(r'\n(?:二、|一、)', body[opts[3].end():])[0])
        raw = atext[am.end():amarks[i + 1].start() if i + 1 < len(amarks) else len(atext)]
        raw = re.sub(r'^\s*解析[：:]\s*', '', raw)
        raw = re.split(r'\n(?:二、|一、)', raw)[0]
        explanation = flatten(raw)
        if not explanation:
            # The lecture answer key omits an explanation for 土地政策第 9 题.
            assert group == 'land' and number == 9
            explanation = ('1931 年形成的土地革命阶级路线是依靠贫农、雇农，联合中农，'
                           '限制富农，保护中小工商业者，消灭地主阶级。四项均属于这一阶级路线。')
        q_page = next(n for n in q_range if m.start() < sum(len(clean_page(p)) + 1 for p in q_range if p <= n))
        q_end = marks[i + 1].start() if i + 1 < len(marks) else len(qtext)
        q_pages = [n for n in q_range if sum(len(clean_page(p)) + 1 for p in q_range if p < n) < q_end
                   and sum(len(clean_page(p)) + 1 for p in q_range if p <= n) > m.start()]
        a_end = amarks[i + 1].start() if i + 1 < len(amarks) else len(atext)
        a_pages = [n for n in a_range if sum(len(clean_page(p)) + 1 for p in a_range if p < n) < a_end
                   and sum(len(clean_page(p)) + 1 for p in a_range if p <= n) > am.start()]
        # A second page is useful only when the explanation itself crosses the page.
        item = {
            'id': f't{group[0]}{number:02d}', 'moduleIdx': 5 if group == 'meeting' else 6,
            'module': '速成班讲义专题练习', 'chapter': '重点会议' if group == 'meeting' else '土地政策',
            'chapterTitle': '习题检测练习', 'section': '单项选择题' if number <= (15 if group == 'meeting' else 8) else '多项选择题',
            'no': number, 'stem': stem, 'options': options, 'answer': am[2],
            'multi': number > (15 if group == 'meeting' else 8),
            'analysis': [{'k': '速成班讲义解析', 't': explanation}],
            'qPage': q_page, 'qPages': q_pages, 'aPages': a_pages,
            'aCrops': [f't{group[0]}{number:02d}-{part}.jpg' for part in range(1, len(a_pages) + 1)],
            'kPages': [k_refs[i]], 'sPages': [s_refs[i]], 'source': 's',
        }
        result.append(item)
    return result


meeting_k = [300, 275, 164, 161, 300, 295, 289, 288, 285, 282, 280, 280, 277, 270, 269,
             188, 280, 160, 157, 161, 160, 151, 151, 290, 290, 288, 280, 277, 275, 271, 269, 269, 269]
meeting_s = [136, 129, 141, 140, 136, 135, 134, 133, 133, 132, 131, 131, 130, 128, 126,
             142, 131, 139, 140, 140, 139, 137, 137, 135, 135, 133, 131, 130, 129, 128, 128, 128, 126]
land_k = [143, 145, 143, 296, 296, 278, 131, 256, 278, 296, 296, 287, 278, 256, 246]
land_s = [169, 169, 169, 169, 168, 167, 165, 166, 167, 169, 168, 168, 167, 166, 165]

questions = extract('meeting', range(143, 152), range(152, 165), meeting_k, meeting_s)
questions += extract('land', range(171, 176), range(176, 182), land_k, land_s)
assert len(questions) == 48
(ROOT / 'data/topical-exercises.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2) + '\n')
print('Generated', len(questions), 'questions')
