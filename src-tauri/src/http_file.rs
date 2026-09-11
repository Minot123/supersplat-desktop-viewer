use std::io::{self, Read, Seek, SeekFrom, Write};

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let (start, end) = value.strip_prefix("bytes=")?.split_once('-')?;
    if size == 0 { return None; }
    if start.is_empty() {
        let count = end.parse::<u64>().ok()?;
        return (count > 0).then(|| (size.saturating_sub(count), size - 1));
    }
    let start = start.parse::<u64>().ok()?;
    let end = if end.is_empty() { size - 1 } else { end.parse::<u64>().ok()?.min(size - 1) };
    (start < size && start <= end).then_some((start, end))
}

pub fn serve<W: Write, R: Read + Seek>(output: &mut W, input: &mut R, content_type: &str, range: Option<&str>, head: bool) -> io::Result<()> {
    // Read current length from the open handle, including after an editor save.
    let size = input.seek(SeekFrom::End(0))?;
    let selected = range.map(|value| parse_range(value, size));
    let (status, start, length, content_range) = match selected {
        Some(Some((start, end))) => ("206 Partial Content", start, end - start + 1, format!("Content-Range: bytes {start}-{end}/{size}\r\n")),
        Some(None) => ("416 Range Not Satisfiable", 0, 0, format!("Content-Range: bytes */{size}\r\n")),
        None => ("200 OK", 0, size, String::new()),
    };
    write!(output, "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {length}\r\n{content_range}Accept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, PUT, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n")?;
    if !head && length > 0 {
        input.seek(SeekFrom::Start(start))?;
        let mut remaining = input.take(length);
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let count = remaining.read(&mut buffer)?;
            if count == 0 { break; }
            output.write_all(&buffer[..count])?;
        }
    }
    output.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn request(range: Option<&str>, head: bool) -> String {
        let mut output = Vec::new();
        serve(&mut output, &mut Cursor::new(b"0123456789"), "text/plain", range, head).unwrap();
        String::from_utf8(output).unwrap()
    }

    #[test]
    fn full_and_head() {
        assert!(request(None, false).ends_with("\r\n\r\n0123456789"));
        let head = request(None, true);
        assert!(head.contains("Content-Length: 10\r\n"));
        assert!(head.ends_with("\r\n\r\n"));
    }

    #[test]
    fn byte_ranges() {
        for (range, body) in [("bytes=0-0", "0"), ("bytes=3-5", "345"), ("bytes=8-", "89"), ("bytes=-3", "789"), ("bytes=8-99", "89")] {
            let response = request(Some(range), false);
            assert!(response.starts_with("HTTP/1.1 206"));
            assert!(response.ends_with(&format!("\r\n\r\n{body}")));
            assert!(response.contains("Access-Control-Expose-Headers: Content-Range"));
        }
    }

    #[test]
    fn invalid_ranges() {
        for range in ["bytes=10-", "bytes=5-3", "bytes=-0", "bytes=a-b", "bytes=0-1,4-5"] {
            let response = request(Some(range), false);
            assert!(response.starts_with("HTTP/1.1 416"));
            assert!(response.contains("Content-Range: bytes */10"));
        }
    }
}
