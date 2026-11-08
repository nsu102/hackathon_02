import hashlib,json,os,stat,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from last_hour.gaze_install import install_archive

class GazeInstallTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.dest=self.root/'component'
 def tearDown(self):self.temp.cleanup()
 def package(self,extra=None):
  file=self.root/'addon.zip'
  with zipfile.ZipFile(file,'w') as archive:
   archive.writestr('component.json',json.dumps({'id':'study-signal-gaze-arm64-v1','model':'unigaze_l16_joint','version':'1.0.0'}))
   info=zipfile.ZipInfo('service/study-service');info.external_attr=(stat.S_IFREG|0o755)<<16;archive.writestr(info,b'executable fixture')
   archive.writestr('models/unigaze_l16_joint.safetensors',b'weights fixture')
   if extra:extra(archive)
  return file,hashlib.sha256(file.read_bytes()).hexdigest()
 def test_verified_package_preserves_modes_and_resolves_only_internal_links(self):
  def extra(z):
   info=zipfile.ZipInfo('service/runtime-link');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(info,'study-service')
  file,digest=self.package(extra);install_archive(file,self.dest,digest,check_runtime=False)
  self.assertEqual(json.loads((self.dest/'installed.json').read_text())['sha256'],digest)
  self.assertTrue((self.dest/'service/study-service').stat().st_mode&0o111);self.assertTrue((self.dest/'service/runtime-link').is_symlink())
 def test_wrong_hash_leaves_existing_install_and_personal_files_untouched(self):
  self.dest.mkdir();(self.dest/'previous.txt').write_text('keep');file,_=self.package()
  with self.assertRaisesRegex(ValueError,'검증'):install_archive(file,self.dest,'0'*64,check_runtime=False)
  self.assertEqual((self.dest/'previous.txt').read_text(),'keep');self.assertFalse(list(self.root.glob('.gaze-install-*')))
 def test_traversal_and_external_symlink_are_rejected(self):
  for escape in [False,True]:
   def extra(z):
    if not escape:z.writestr('../outside',b'bad')
    else:
     info=zipfile.ZipInfo('service/escape');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(info,'../../outside')
   file,digest=self.package(extra)
   with self.assertRaises(ValueError):install_archive(file,self.dest,digest,check_runtime=False)
   self.assertFalse(self.dest.exists());self.assertFalse((self.root/'outside').exists())
 def test_cancel_cleans_staging_and_keeps_previous_component(self):
  self.dest.mkdir();(self.dest/'previous.txt').write_text('keep');file,digest=self.package()
  def emit(phase,_):
   if phase=='extracting':raise InterruptedError('cancel')
  with patch('last_hour.gaze_install.emit',side_effect=emit):
   with self.assertRaises(InterruptedError):install_archive(file,self.dest,digest,check_runtime=False)
  self.assertTrue((self.dest/'previous.txt').exists());self.assertFalse(list(self.root.glob('.gaze-install-*')))
