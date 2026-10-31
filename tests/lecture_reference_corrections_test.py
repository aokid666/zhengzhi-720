import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('semantic_apply',ROOT/'scripts/apply-semantic-review.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ReferenceCorrectionTests(unittest.TestCase):
 def test_only_exact_snapshot_is_removed_and_reruns_are_safe(self):
  old={'page':'320','quote':'错误的考点定位'};other={'page':'321','quote':'其他人保留的定位'}
  original=[old,other];got=module.remove_reviewed_references(original,[old],lambda e:e['page'])
  self.assertEqual(got,[other]);self.assertEqual(original,[old,other]);self.assertEqual(module.remove_reviewed_references(got,[old],lambda e:e['page']),[other])
 def test_an_independently_edited_target_is_rejected(self):
  old={'page':'320','quote':'原来定位'}
  with self.assertRaises(AssertionError):module.remove_reviewed_references([{'page':'320','quote':'他人修改后的定位'}],[old],lambda e:e['page'])
 def test_extra_source_identity_includes_the_volume(self):
  old={'source':'upper','page':236,'quote':'错配'};other={'source':'lower','page':236,'quote':'另一份资料'}
  self.assertEqual(module.remove_reviewed_references([old,other],[old],lambda e:(e['source'],e['page'])),[other])
if __name__=='__main__':unittest.main()
