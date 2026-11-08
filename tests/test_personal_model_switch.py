import importlib.util,tempfile,unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('personal_switch',Path(__file__).resolve().parents[1]/'scripts/use_personal_model.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PersonalModelSwitchTests(unittest.TestCase):
 def test_atomic_selection_preserves_existing_openrouter_key_and_uses_private_permissions(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'.env';path.write_text('OPENROUTER_API_KEY=fixture-only\n# preserve this\nSTUDY_MODEL_PROVIDER=openrouter\n')
   module.write_env(path,{'STUDY_MODEL_PROVIDER':'compatible','STUDY_MODEL_ENDPOINT':'http://127.0.0.1:18001/v1'})
   text=path.read_text();self.assertIn('OPENROUTER_API_KEY=fixture-only',text);self.assertIn('# preserve this',text);self.assertIn('STUDY_MODEL_PROVIDER=compatible',text);self.assertEqual(path.stat().st_mode&0o777,0o600)
   module.write_env(path,{'STUDY_MODEL_PROVIDER':'openrouter'})
   self.assertEqual(path.read_text().count('STUDY_MODEL_PROVIDER='),1)
