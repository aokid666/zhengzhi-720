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
                    if kind in ['k','s']:self.assertGreaterEqual(int(e['page']),10)
                    self.assertIn(e['quote'],corpus.pages[e['page']]['raw'])
                    if e['method']=='reviewed-passage':self.assertTrue(e['note'])
                    else:
                        self.assertTrue(e['answerRun']>=min(7,len(e['answer'])) or e['answerRun']>=18)
                        self.assertTrue(e['promptRun']>=6 or e['method'] in ['statement','answer-phrase'])
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

    def test_main_form_is_not_confused_with_main_enemy_or_three_magic_weapons(self):
        row=self.data['items']['pr-hat-mao-cloze-0025']
        self.assertTrue(any(e['page']=='u081' for e in row['m']))
        self.assertTrue(all(e['page']!='l105' for e in row['m']))

    def test_historical_conditions_are_not_replaced_by_a_practical_foundation(self):
        row=self.data['items'].get('pr-hat-mao-cloze-0078',{})
        self.assertTrue(all(e['page']!='121' for e in row.get('k',[])))

    def test_complete_distinctive_answer_and_short_concept_are_searchable(self):
        row=self.data['items'].get('pr-hat-mao-cloze-0026',{})
        self.assertTrue(row.get('k') or row.get('s'))
        row=self.data['items'].get('pr-hat-marx-cloze-0029',{})
        self.assertTrue(row.get('k'))

    def test_explanation_boilerplate_does_not_link_eight_rules_to_two_establishments(self):
        row=self.data['items'].get('pr-mipeng6-choice-3-13',{})
        self.assertTrue(all(e['page']!='171' for e in row.get('k',[])))
        q=self.questions['pr-mipeng6-choice-3-13']
        self.assertTrue(all('核心全党的核心地位的确立' not in a for p,a,t in review.facts(q)))

if __name__=='__main__':unittest.main()
