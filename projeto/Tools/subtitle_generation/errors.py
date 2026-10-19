"""Expected failures, with stable error kinds and actionable CLI messages."""


class SubtitleError(Exception):
    """A validation, media, inference or output failure safe to show to the user."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
