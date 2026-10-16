"""Testes da lógica dos troços. Correr na pasta Tools/silence_removal com:
    python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import segments as seg  # noqa: E402
from errors import JobError  # noqa: E402

W = 0.01  # janela de 10 ms


def levels(spec, total_sec):
    """spec: lista de (início, fim) de silêncio; o resto é fala (-10 dB)."""
    n = int(round(total_sec / W))
    out = [-10.0] * n
    for s, e in spec:
        for i in range(int(round(s / W)), int(round(e / W))):
            out[i] = -80.0
    return out


EQUILIBRADO = seg.validate_options({"profile": "equilibrado"})


class TestOptions(unittest.TestCase):
    def test_defaults_are_equilibrado(self):  # REQ-VID-SIL-001
        self.assertEqual((EQUILIBRADO["thresholdDb"], EQUILIBRADO["minPauseSec"], EQUILIBRADO["marginMs"]),
                         (-35.0, 0.7, 150.0))

    def test_agressivo_profile(self):  # REQ-VID-SIL-002
        o = seg.validate_options({"profile": "agressivo"})
        self.assertEqual((o["thresholdDb"], o["minPauseSec"], o["marginMs"]), (-30.0, 0.4, 80.0))

    def test_out_of_range_rejected(self):  # REQ-VID-SIL-001
        for bad in ({"thresholdDb": -70}, {"minPauseSec": 6}, {"marginMs": 1500}, {"thresholdDb": "x"}):
            with self.assertRaises(JobError):
                seg.validate_options(bad)


class TestDetection(unittest.TestCase):
    def test_margin_example(self):  # REQ-VID-SIL-008: 10,0-12,0 s com 150 ms -> 10,15-11,85 s
        found, *_ = seg.detect_segments(levels([(10.0, 12.0)], 20), W, 20, EQUILIBRADO)
        self.assertEqual(len(found), 1)
        self.assertAlmostEqual(found[0][0], 10.15, places=3)
        self.assertAlmostEqual(found[0][1], 11.85, places=3)

    def test_short_after_margin_discarded(self):  # REQ-VID-SIL-008: 0,8 s com 150 ms e mínimo 0,7 s
        found, _, reason, suggestion = seg.detect_segments(levels([(5.0, 5.8)], 20), W, 20, EQUILIBRADO)
        self.assertEqual(found, [])
        self.assertEqual((reason, suggestion), ("none_found", "agressivo"))  # REQ-VID-SIL-015

    def test_click_inside_pause_is_merged(self):
        # pausa 2,0-4,0 s com um clique de 20 ms a meio: deve continuar a ser um troço só
        lv = levels([(2.0, 2.99), (3.01, 4.0)], 10)
        found, *_ = seg.detect_segments(lv, W, 10, EQUILIBRADO)
        self.assertEqual(len(found), 1)

    def test_mostly_silent(self):  # REQ-VID-SIL-015: > 95% silêncio
        found, ratio, reason, suggestion = seg.detect_segments(levels([(0.0, 9.8)], 10), W, 10, EQUILIBRADO)
        self.assertEqual(found, [])
        self.assertGreater(ratio, 0.95)
        self.assertEqual((reason, suggestion), ("too_silent", "suave"))


class TestSavings(unittest.TestCase):
    def test_savings_example(self):  # REQ-VID-SIL-012: 120 s, 30 s -> 25 s
        segs = [(0, 10), (20, 35), (50, 55)]
        self.assertEqual(seg.savings(120, segs)["removedPct"], 25.0)
        s = seg.savings(120, [(0, 10), (20, 35)])
        self.assertEqual((s["removedSec"], s["removedPct"]), (25.0, 20.8))


class TestUserSegments(unittest.TestCase):
    def test_overlap_rejected(self):  # REQ-VID-SIL-011
        with self.assertRaises(JobError):
            seg.validate_user_segments([{"start": 1, "end": 3}, {"start": 2.5, "end": 4}], 10)

    def test_beyond_duration_rejected(self):  # REQ-VID-SIL-011
        with self.assertRaises(JobError):
            seg.validate_user_segments([{"start": 8, "end": 12}], 10)

    def test_empty_rejected(self):  # REQ-VID-SIL-016
        with self.assertRaises(JobError):
            seg.validate_user_segments([], 10)

    def test_keep_intervals_complement_on_frame_grid(self):  # REQ-VID-SIL-021
        keeps = seg.keep_intervals(10.0, [(2.01, 3.0), (5.0, 6.0)], 25)
        self.assertEqual(keeps, [(0.0, 2.0), (3.0, 5.0), (6.0, 10.0)])
        for a, b in keeps:
            self.assertAlmostEqual((a * 25) % 1, 0, places=6)
            self.assertAlmostEqual((b * 25) % 1, 0, places=6)


if __name__ == "__main__":
    unittest.main()
