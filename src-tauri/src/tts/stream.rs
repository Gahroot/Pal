//! TTS text streaming and chunking pipeline.
//!
//! Mirrors the Swift SpeechService pattern with ordered slots and
//! text draining at sentence/clause boundaries:
//! ```swift
//! private static let maxChunkChars = 200
//! func drainBuffer() -> [String] { ... }
//! ```
//!
//! Text arrives incrementally from the LLM stream. We accumulate it
//! and drain at natural boundaries (sentence-ending punctuation,
//! clause-ending punctuation) to produce chunks for TTS synthesis.

use regex::Regex;
use std::sync::LazyLock;

// ── Constants ───────────────────────────────────────────────────────────

/// Maximum characters per TTS chunk.
const MAX_CHUNK_CHARS: usize = 200;
/// Minimum fragment size before we'll consider draining.
const MIN_FRAGMENT: usize = 20;
/// Eagerly flush if we have this many chars and see a clause boundary.
const EAGER_FLUSH: usize = 30;
/// Flush at clause boundaries once we exceed this length.
const CLAUSE_FLUSH: usize = 60;
/// Time-based flush delay (not enforced here, caller should use this).
#[allow(dead_code)]
pub const FLUSH_DELAY_MS: u64 = 300;

// ── Regex patterns ──────────────────────────────────────────────────────

static SENTENCE_BOUNDARY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[.!?]\s+").expect("invalid sentence boundary regex"));

static CLAUSE_BOUNDARY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[,;:\u{2014}\u{2013}]\s+").expect("invalid clause boundary regex"));

/// Regex patterns for stripping markdown from TTS text.
static MD_CODE_BLOCK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"```[\s\S]*?```").expect("invalid regex"));
static MD_INLINE_CODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"`[^`]+`").expect("invalid regex"));
static MD_HEADER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^#{1,6}\s+").expect("invalid regex"));
static MD_BOLD_ITALIC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\*{1,3}([^*]+)\*{1,3}").expect("invalid regex"));
static MD_UNDERLINE_BOLD_ITALIC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"_{1,3}([^_]+)_{1,3}").expect("invalid regex"));
static MD_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\([^)]+\)").expect("invalid regex"));
static MD_IMAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"!\[([^\]]*)\]\([^)]+\)").expect("invalid regex"));
// Match common emoji patterns (simple unicode emoji ranges).
static EMOJI: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}\x{FE00}-\x{FE0F}\x{1F900}-\x{1F9FF}\x{200D}\x{20E3}\x{E0020}-\x{E007F}]+"
    ).expect("invalid emoji regex")
});

/// TTS text streaming pipeline.
///
/// Accumulates text from the LLM stream and drains it at natural
/// boundaries to produce utterance chunks for TTS synthesis.
pub struct TtsStream {
    /// Accumulated text buffer waiting to be drained.
    stream_buffer: String,
    /// Whether we've flushed the first chunk (first chunk uses eager threshold).
    has_flushed_first: bool,
    /// Whether the stream has been finished (no more input expected).
    finished: bool,
}

impl TtsStream {
    pub fn new() -> Self {
        Self {
            stream_buffer: String::new(),
            has_flushed_first: false,
            finished: false,
        }
    }

    /// Feed a new text chunk from the LLM stream.
    ///
    /// The text is stripped of markdown, accumulated, and the caller
    /// should call `drain_buffer()` to extract ready utterances.
    pub fn feed_chunk(&mut self, text: &str) {
        let clean = strip_markdown(text);
        if !clean.is_empty() {
            self.stream_buffer.push_str(&clean);
        }
    }

    /// Extract utterances that are ready for synthesis.
    ///
    /// Splits at sentence boundaries first, then at clause boundaries
    /// if the buffer is long enough. Respects MAX_CHUNK_CHARS.
    pub fn drain_buffer(&mut self) -> Vec<String> {
        let mut chunks = Vec::new();

        loop {
            let buf_len = self.stream_buffer.len();
            if buf_len == 0 {
                break;
            }

            // Determine the flush threshold based on whether we've sent
            // the first chunk (eager) or not.
            let min_len = if self.has_flushed_first {
                MIN_FRAGMENT
            } else {
                EAGER_FLUSH
            };

            if buf_len < min_len {
                break;
            }

            // Try sentence boundary first.
            if let Some(m) = self.find_last_boundary(&SENTENCE_BOUNDARY, buf_len.min(MAX_CHUNK_CHARS)) {
                let chunk: String = self.stream_buffer.drain(..m).collect();
                let trimmed = chunk.trim().to_string();
                if !trimmed.is_empty() {
                    chunks.push(trimmed);
                    self.has_flushed_first = true;
                }
                continue;
            }

            // Try clause boundary if buffer is long enough.
            if buf_len >= CLAUSE_FLUSH {
                if let Some(m) = self.find_last_boundary(&CLAUSE_BOUNDARY, buf_len.min(MAX_CHUNK_CHARS)) {
                    let chunk: String = self.stream_buffer.drain(..m).collect();
                    let trimmed = chunk.trim().to_string();
                    if !trimmed.is_empty() {
                        chunks.push(trimmed);
                        self.has_flushed_first = true;
                    }
                    continue;
                }
            }

            // Force split at MAX_CHUNK_CHARS if buffer exceeds it.
            if buf_len > MAX_CHUNK_CHARS {
                // Try to split at a word boundary.
                let search_range = &self.stream_buffer[..MAX_CHUNK_CHARS];
                let split_at = search_range
                    .rfind(' ')
                    .unwrap_or(MAX_CHUNK_CHARS);
                let chunk: String = self.stream_buffer.drain(..split_at).collect();
                let trimmed = chunk.trim().to_string();
                if !trimmed.is_empty() {
                    chunks.push(trimmed);
                    self.has_flushed_first = true;
                }
                continue;
            }

            // Not enough text to drain yet.
            break;
        }

        chunks
    }

    /// Force flush: drain everything in the buffer as a single chunk.
    pub fn flush(&mut self) -> Vec<String> {
        let mut chunks = Vec::new();
        let text = self.stream_buffer.trim().to_string();
        self.stream_buffer.clear();
        if !text.is_empty() {
            // Split into MAX_CHUNK_CHARS pieces if needed.
            let mut remaining = text.as_str();
            while !remaining.is_empty() {
                if remaining.len() <= MAX_CHUNK_CHARS {
                    chunks.push(remaining.to_string());
                    break;
                }
                let split_at = remaining[..MAX_CHUNK_CHARS]
                    .rfind(' ')
                    .unwrap_or(MAX_CHUNK_CHARS);
                chunks.push(remaining[..split_at].trim().to_string());
                remaining = remaining[split_at..].trim_start();
            }
            self.has_flushed_first = true;
        }
        chunks
    }

    /// Signal that the stream is finished. Drains all remaining text.
    pub fn finish(&mut self) -> Vec<String> {
        self.finished = true;
        self.flush()
    }

    /// Whether the stream is finished.
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    /// Current buffer length.
    pub fn buffer_len(&self) -> usize {
        self.stream_buffer.len()
    }

    /// Reset for a new stream.
    pub fn reset(&mut self) {
        self.stream_buffer.clear();
        self.has_flushed_first = false;
        self.finished = false;
    }

    // ── Internal ────────────────────────────────────────────────────────

    /// Find the end of the last complete boundary match within `max_pos`.
    fn find_last_boundary(&self, pattern: &Regex, max_pos: usize) -> Option<usize> {
        let search = &self.stream_buffer[..max_pos.min(self.stream_buffer.len())];
        let mut last_end = None;
        for m in pattern.find_iter(search) {
            last_end = Some(m.end());
        }
        // Only return if we have enough text before the boundary.
        last_end.filter(|&pos| pos >= MIN_FRAGMENT)
    }
}

impl Default for TtsStream {
    fn default() -> Self {
        Self::new()
    }
}

/// Strip markdown formatting from text for cleaner TTS output.
///
/// Removes: code blocks, inline code, headers, bold/italic markers,
/// links (keeps text), images (keeps alt text), and emoji.
pub fn strip_markdown(text: &str) -> String {
    let mut result = text.to_string();
    // Order matters: code blocks before inline code.
    result = MD_CODE_BLOCK.replace_all(&result, "").to_string();
    result = MD_INLINE_CODE.replace_all(&result, "").to_string();
    result = MD_IMAGE.replace_all(&result, "$1").to_string();
    result = MD_LINK.replace_all(&result, "$1").to_string();
    result = MD_HEADER.replace_all(&result, "").to_string();
    result = MD_BOLD_ITALIC.replace_all(&result, "$1").to_string();
    result = MD_UNDERLINE_BOLD_ITALIC.replace_all(&result, "$1").to_string();
    result = EMOJI.replace_all(&result, "").to_string();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_markdown_basic() {
        assert_eq!(strip_markdown("**bold**"), "bold");
        assert_eq!(strip_markdown("*italic*"), "italic");
        assert_eq!(strip_markdown("# Header"), "Header");
        assert_eq!(strip_markdown("[link](http://example.com)"), "link");
        assert_eq!(strip_markdown("`code`"), "");
    }

    #[test]
    fn test_strip_markdown_code_block() {
        let input = "Before\n```rust\nfn main() {}\n```\nAfter";
        let result = strip_markdown(input);
        assert!(result.contains("Before"));
        assert!(result.contains("After"));
        assert!(!result.contains("fn main"));
    }

    #[test]
    fn test_drain_sentence_boundary() {
        let mut stream = TtsStream::new();
        stream.feed_chunk("Hello, this is a test. And this is another sentence. ");
        let chunks = stream.drain_buffer();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_drain_respects_min_fragment() {
        let mut stream = TtsStream::new();
        stream.feed_chunk("Hi. ");
        let chunks = stream.drain_buffer();
        // "Hi. " is only 4 chars, below MIN_FRAGMENT
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_finish_drains_everything() {
        let mut stream = TtsStream::new();
        stream.feed_chunk("Short text");
        let chunks = stream.finish();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Short text");
        assert_eq!(stream.buffer_len(), 0);
    }

    #[test]
    fn test_long_text_force_split() {
        let mut stream = TtsStream::new();
        let long = "word ".repeat(100); // 500 chars
        stream.feed_chunk(&long);
        let chunks = stream.drain_buffer();
        assert!(!chunks.is_empty());
        for chunk in &chunks {
            assert!(chunk.len() <= MAX_CHUNK_CHARS + 10); // small margin for word boundary
        }
    }
}
