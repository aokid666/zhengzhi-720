import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];sp=importlib.util.spec_from_file_location('concepts',ROOT/'scripts/recheck-concept-lectures.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
class ConceptTests(unittest.TestCase):
 def test_numbered_answer_references_expand_to_actual_statements(self):
  q={'stem':'中国近代的主要矛盾：①帝国主义和中华民族的矛盾②工人阶级和资产阶级的矛盾③封建主义和人民大众的矛盾','options':{'A':'①③'},'answer':'A'}
  fs=m.facts(q);self.assertTrue(any(a==m.canon('帝国主义和中华民族的矛盾') for p,a,t in fs));self.assertTrue(any(a==m.canon('封建主义和人民大众的矛盾') for p,a,t in fs));self.assertFalse(any(a==m.canon('工人阶级和资产阶级的矛盾') for p,a,t in fs))
 def test_exact_named_definition_links_original_heading(self):
  c=m.DefinitionCorpus('k',{'20':'资本价值构成\n资本由不变资本和可变资本的价值构成。'},{'20':{'马克思主义基本原理'}});q={'stem':'棉花原材料价格上涨，变化的资本构成是','options':{'A':'资本价值构成'},'answer':'A'}
  hits=c.heading(q,'马克思主义基本原理');self.assertTrue(hits);self.assertEqual(hits[0]['method'],'concept-definition');self.assertIn(hits[0]['quote'],c.pages['20']['raw']);self.assertEqual(c.heading(q,'思想道德与法治'),[])
 def test_does_not_use_generic_people_or_opposite_predicate(self):
  c=m.DefinitionCorpus('k',{'20':'剩余价值转化为利润，掩盖了剩余价值的真正来源。'},{})
  fs=[(m.canon('剩余价值来源'),m.canon('揭示了剩余价值的真正来源'),'pair')]
  self.assertEqual(c.recover({'stem':'揭示来源','answer':'A','options':{'A':'揭示了剩余价值的真正来源'}},fs,''),[])
  self.assertEqual(c.heading({'stem':'这个观点的内容','answer':'A','options':{'A':'人民'}},''),[])
 def test_incidental_words_and_generic_cloze_answers_are_not_definitions(self):
  c=m.DefinitionCorpus('s',{'192':'放弃了无产阶级的领导权，导致大革命失败。'},{})
  q={'stem':'中国革命的中心问题是','options':{'A':'无产阶级领导权'},'answer':'A'}
  self.assertEqual(c.heading(q,''),[])
  q={'type':'cloze','stem':'劳动价值论揭示了商品经济的规律','cloze':{'masks':[{'text':'一般规律'}]}}
  self.assertEqual(m.terms(q),[])
 def test_page_continuation_keeps_two_verbatim_original_fragments(self):
  data={'21':'和资本流通时间共同组成。','20':'资本周转时间由资本生产时间'}
  data.update({str(n):'这里是无关的测试背景文字，不包含待核对的资本概念。'+str(n) for n in range(22,90)})
  c=m.DefinitionCorpus('k',data,{})
  fs=[(m.canon('资本周转时间'),m.canon('资本周转时间由资本生产时间和资本流通时间共同组成'),'explanation')]
  hits=c.continuation(fs,'');self.assertEqual([h['page'] for h in hits],['20','21'])
  for h in hits:self.assertIn(h['quote'],data[h['page']]);self.assertEqual(h['method'],'cross-page')
 def test_canonical_normalization_preserves_original_coordinates(self):
  t,pos=m.canon('物质的根本属性',True);self.assertEqual(t,'物质根本属性');self.assertEqual(''.join('物质的根本属性'[i] for i in pos),t)
if __name__=='__main__':unittest.main()
