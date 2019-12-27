- mp4box = null
- mp4boxHdr = new MP4Box()

`downloader = downloaderNEW()`
`downloader.start()`
  - 1st buffer => `mp4boxHdr.appendBuffer()`
    - loop until `mp4boxHdr.readySent`
  - `downloader.stop()`
  - FETCH_ENTIRE_FILE -> true
  - inMSE -> true
  - downloader = null
  - `downloader = downloaderNEW()`
  - arybuf = mp4boxHdr.inputStream.buffers.arybuf
  - `this.mp4box = mp4boxNEW()`
    - onReady => start segmenting
    - onSegment => .../xxx
  - mp4box.appendBuffer(arybuf)
  - mp4boxHdr = null
  - downloader resume (from end of src mp4 header)
  - mp4box.appendBuffer(response)
