"""STT cues that end after the video or touch each other (Faster-Whisper padding). Run in
Tools/subtitle_generation with:  python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import srt  # noqa: E402
from errors import SubtitleError  # noqa: E402
from srt import Segment  # noqa: E402


class FitToDurationTests(unittest.TestCase):
    def test_last_cue_past_the_end_of_the_video_is_clipped_not_rejected(self):
        # Manual test: a 10.5186 s video failed with "O segmento 3 ultrapassa a duração do vídeo".
        raw = [Segment("a", 0.0, 3.0), Segment("b", 3.0, 7.0), Segment("c", 7.0, 10.56)]
        cues = srt.validate_segments(srt.fit_to_duration(raw, 10.5186), 10.5186)
        self.assertEqual(cues[-1], Segment("c", 7.0, 10.5186))
        self.assertIn("00:00:10,519", srt.render_srt(cues, 10.5186))

    def test_a_cue_that_starts_at_or_after_the_end_is_dropped(self):
        raw = [Segment("a", 0.0, 5.0), Segment("b", 10.5186, 11.0), Segment("c", 10.6, 12.0)]
        self.assertEqual(srt.fit_to_duration(raw, 10.5186), [Segment("a", 0.0, 5.0)])

    def test_a_small_overlap_with_the_previous_cue_starts_at_its_end(self):
        raw = [Segment("a", 0.0, 4.0), Segment("b", 3.98, 6.0)]
        self.assertEqual(srt.fit_to_duration(raw, 10)[1], Segment("b", 4.0, 6.0))

    def test_cues_inside_the_video_are_unchanged(self):
        raw = [Segment("a", 0.5, 2.0), Segment("b", 2.5, 9.0)]
        self.assertEqual(srt.fit_to_duration(raw, 10), raw)

    def test_segments_edited_by_the_user_are_still_rejected(self):
        # generate_srt validates the reviewed segments as they are (no silent clipping).
        with self.assertRaises(SubtitleError):
            srt.validate_segments([Segment("a", 0.0, 10.6)], 10.5186)


if __name__ == "__main__":
    unittest.main()
