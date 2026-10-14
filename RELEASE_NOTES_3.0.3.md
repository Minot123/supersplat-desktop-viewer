# SuperSplat Desktop Viewer 3.0.3

- Fix local TCP port exhaustion during large-scene PLY and SOG exports. The local file server now reuses HTTP/1.1 connections for range reads instead of closing a connection after every request.
- Keep byte-range, HEAD, CORS and explicit client connection-close behavior intact. Project uploads continue to use the existing save path.
- Reject ambiguous request framing and stop a connection if a source file becomes shorter during a response, preventing subsequent responses from being interpreted as scene data.
- Disable Nagle buffering on the local connection to avoid unnecessary delays for small range requests.
- Add native regression tests for connection reuse, ranges, HEAD, HTTP/1.0, client-requested close, malformed requests and truncated source files.

The renderer, editor version and scene-processing settings are unchanged. This update does not load a second full copy of the source file to work around export failures.
