"""Source evidence, short facts, subject ambiguity, and preservation regression checks."""
import importlib.util, json, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-lecture-links.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)

class LectureReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpora=review.corpora();cls.data=review.read('lecture-links');cls.questions={q['id']:q for q in review.pool()}

    def test_every_added_reference_has_verbatim_evidence_and_unchanged_question(self):
        old=review.read('manual-matches')
        for id,row in self.data['items'].items():
            q=self.questions[id];self.assertEqual(row['sig'],review.signature(q))
            for kind,field in review.FIELDS.items():
                for e in row.get(kind,[]):
                    self.assertFalse(q.get(field))
                    if kind=='m':self.assertFalse(old.get(id))
                    corpus=self.corpora[kind];self.assertIn(e['page'],corpus.pages)
                    self.assertIn(e['quote'],corpus.pages[e['page']]['raw'])
                    self.assertTrue(e['answerRun']>=min(7,len(e['answer'])) or e['answerRun']>=18)
                    self.assertTrue(e['promptRun']>=6 or e['method']=='statement')
                    if kind=='m':self.assertFalse(e['page'].startswith('l') and 17<=int(e['page'][1:])<=65)

    def test_short_first_coauthored_book_fact_is_recovered_despite_table_layout(self):
        q=next(q for q in self.questions.values() if q.get('bookId')=='hat-marx' and '第一次合作' in q['stem'])
        row=self.data['items'][q['id']]
        self.assertEqual([e['page'] for e in row['k']],['13'])
        self.assertEqual([e['page'] for e in row['s']],['11'])
        self.assertIn('神圣家族',row['k'][0]['quote'])

    def test_short_answer_cannot_cross_subjects_on_the_word_people_alone(self):
        q={'module':'思想道德与法治','stem':'社会主义核心价值观的根本特性是','options':{'A':'人民性'},'answer':'A'}
        hits=self.corpora['k'].find(review.facts(q),review.module_of(q))
        self.assertTrue(hits)
        self.assertTrue(all(304<=int(e['page'])<=326 for e in hits))
        self.assertTrue(any('核心价值观' in e['quote'] for e in hits))

    def test_generic_topic_and_fabricated_statement_do_not_create_references(self):
        for prompt,answer in [('这个观点的重要内容','人民'),('火星移民考试中紫色植物理论的第一性原理','量子糖果')]:
            for corpus in self.corpora.values():self.assertEqual(corpus.find([(review.norm(prompt),review.norm(answer),'pair')],''),[])

if __name__=='__main__':unittest.main()
