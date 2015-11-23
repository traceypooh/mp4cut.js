# mp4cut.js
JS/clientside based clipping of an .mp4 file - rewrites header and only (losslessly) sends desired A/V packets for the start/end range


Here's the gist of the idea and what this does.  For a given mp4 video, instead of downloading/buffering the whole thing:

* read (just) the mp4 header via XHR
* determine start/end A/V points based on a client's wanted time range
* rewrite mp4 header in JS buffers
* use MediaSource as conduit to inject new header to <video> html5 tag -- modifying the header "on the fly" to be compatible with MediaSource
* XHR bytes range request just the wanted A/V to a buffer
* (losslessly) append the wanted A/V buffer of bytes to the MediaSource/video tag


See the demonstration page:
* http://htmlpreview.github.io/?https://github.com/traceypooh/mp4cut.js/blob/master/index.html
