import unittest
from last_hour.heart_feed import HeartRateFeed
class LocalCollectorTests(unittest.TestCase):
 def setUp(self):self.now=1000.;self.feed=HeartRateFeed(clock=lambda:self.now);self.feed.running=True
 def test_receipt_age_is_preserved_and_polling_does_not_invent_new_samples(self):
  first=self.feed.normalize_local_collector({'bpm':72,'age':3});self.feed.accept(first);self.now+=2
  second=self.feed.normalize_local_collector({'bpm':72,'age':5});self.assertEqual(first,second);self.assertFalse(self.feed.accept(second));self.assertEqual(self.feed.status()['sample_count'],1)
  self.now+=20;third=self.feed.normalize_local_collector({'bpm':72,'age':25});self.assertEqual(first,third);self.assertFalse(self.feed.status()['connected']);self.assertIsNone(self.feed.status()['bpm'])
 def test_new_receipt_is_distinct_even_when_bpm_is_identical(self):
  first=self.feed.normalize_local_collector({'bpm':72,'age':0});self.feed.accept(first);self.now+=3
  second=self.feed.normalize_local_collector({'bpm':72,'age':0});self.assertNotEqual(first['sample_id'],second['sample_id']);self.feed.accept(second)
  self.assertEqual(self.feed.status()['source'],'collector');self.assertNotIn('Apple Watch',self.feed.status()['message'])
 def test_waiting_stale_invalid_values_and_disconnect(self):
  self.assertEqual(self.feed.normalize_local_collector({'bpm':None,'age':None}),{'status':'waiting'})
  self.assertEqual(self.feed.normalize_local_collector({'bpm':72,'age':61}),{'status':'stale'})
  for value in [{'bpm':True,'age':0},{'bpm':72,'age':-1},{'bpm':72,'age':float('nan')}]:
   with self.assertRaises(ValueError):self.feed.normalize_local_collector(value)
  self.feed.accept(self.feed.normalize_local_collector({'bpm':72,'age':0}));self.feed.stop();self.assertIsNone(self.feed.legacy);self.assertEqual(self.feed.status()['sample_count'],0)
