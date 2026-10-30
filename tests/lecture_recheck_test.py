import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('recheck',ROOT/'scripts/recheck-missing-lectures.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RecheckTests(unittest.TestCase):
 def test_short_definition_survives_teaching_note_and_copula_variation(self):
  q={'stem':'意识是人脑的分泌物。','type':'written','analysis':[{'t':'意识是人脑的机能和属性技巧助背：人脑只能搭配机能属性'}]}
  fs=m.extra_facts(q);self.assertTrue(any(a=='意识是人脑的机能和属性' for p,a,t in fs))
  c=m.RecheckCorpus('k',{'18':'意识是物质世界长期发展的产物，是人脑的机能和属性，是客观世界的主观映象。'},{'18':{'马克思主义基本原理'}})
  hits=c.recover(fs,'马克思主义基本原理');self.assertTrue(hits);self.assertTrue(all(e['page']=='18' for e in hits))
 def test_negation_and_wrong_subject_cannot_become_short_definition_evidence(self):
  c=m.RecheckCorpus('k',{'18':'意识不是人脑的分泌物，意识是物质世界长期发展的产物。'},{'18':{'马克思主义基本原理'}})
  self.assertEqual(c.short_definitions([('意识是人脑的分泌物','意识是人脑的分泌物','pair')],'马克思主义基本原理'),[])
  c=m.RecheckCorpus('k',{'18':'意识是物质世界长期发展的产物，是人脑的机能和属性。'},{'18':{'马克思主义基本原理'}})
  self.assertEqual(c.recover([('意识是人脑的分泌物','意识是人脑的机能和属性','pair')],'思想道德与法治'),[])
if __name__=='__main__':unittest.main()
