
/*

- read mp4 header
- determine seek pts
- rewrite header
- write
- xhr dump start/end range


 # to build your own tailored mp4box.js
 git clone git@github.com:gpac/mp4box.js
 cd mp4box.js
 yarn
 grunt

*/

import cgiarg from './cgiarg.js'

/* global $ jQuery */
const log = console.log.bind(console) // convenient, no?  Stateless function


const ab2str = (buf) => {
  return String.fromCharCode.apply(null, new Uint16Array(buf))
}

const str2ab = (str) => {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf
}

const ablog = (buffer) => {
  const bufView = new Uint8Array(buffer)
  const length = bufView.length
  let result = ''
  log(buffer)
  log('AB length: ', length)
  const length2 = Math.min(2000, length) // xxx
  for(let i = 0; i < length2; i+=65535) {
    var addition = 65535
    if(i + 65535 > length2)
      addition = length2 - i
    result += String.fromCharCode.apply(null, bufView.subarray(i,i+addition))
  }
  if(!result)
    log('buffer was invalid')

  log(result)
  return length
}


const SEGMENT_NUMBER_SAMPLES = 1000
let DOWNLOADER_CHUNK_SIZE = 100000
const autoplay = true
const REWRITE = false // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
const FKING_FAIL = true // xxx

let FETCH_ENTIRE_FILE = false
let video = false
let inMSE = false
let START = 0
let END = 10800 // xxx


class MP4cut {
  constructor(FILE, start, end) {
    if (!FILE) {
      FILE = 'http://ia600301.us.archive.org/~tracey/cors_get.php?path=/27/items/stairs/stairs.mp4';
      FILE = 'http://ia600404.us.archive.org/~tracey/cors_get.php?path=/22/items/commute/commute.mp4';
    }

    if (FILE === 'commute.mp4')
      DOWNLOADER_CHUNK_SIZE = 2000000 // ~1.9MB

    const id = cgiarg('id')
    if (id)
      FILE = `/download/${id}/${id}.mp4?tunnel=1`

    if (start)
      START = start
    if (end)
      END = end


    this.mediaSource = new MediaSource()

    if (0  &&  FILE === 'commute.mp4')
      Log.setLogLevel(Log.info)
    else
      Log.setLogLevel(Log.debug)

    log('FILE: ', FILE)




    this.resetMediaSource()  //xxxx
  //video.play() // xxx need to wait for user event now these days

    window.mp4boxHdr = new MP4Box() // xxx
    window.mp4box    = null // xxx

    mp4boxHdr.onMoovStart = () => log('HDR starting to receive File info')
    mp4boxHdr.onError = (e) => log('HDR error', e)
    mp4boxHdr.onReady = (info) => log('HDR onReady info', info)



    const mp4boxNEW = () => {
      mp4box = new MP4Box()
      mp4box.onMoovStart = () => {
        log('Starting to receive File Information')
      }

      mp4box.onReady = (info) => {
        log('onReady info', info)
        this.initializeSourceBuffersAndSegmentation(info)
      }

      mp4box.onSegment = (id, user, buffer, sampleNum) => {	//xxxxx
	      var sb = user
	      sb.segmentIndex++
	      sb.pendingAppends.push({ id, buffer, sampleNum })
        Log.info(`Received new segment for track ${id}
          up to sample #${sampleNum},
          segments pending append: ${sb.pendingAppends.length}`)
	      MP4cut.onUpdateEnd(sb, true, false)
      }
    }


    const downloaderNEW = (chunk_size) => {
      let downloader = new Downloader()
      downloader.setInterval(100)
      if (!chunk_size)
        chunk_size = DOWNLOADER_CHUNK_SIZE
      downloader.setChunkSize(chunk_size)
      downloader.setUrl(FILE)



      downloader.setCallback((response, end, error) => {
        log('================== DL callback() ========================================================')
        log('DL end: ', end)
        log('DL response #bytes: ', (response ? response.byteLength : 0))
        // response == ArrayBuffer;  response.usedBytes -v- response.byteLength


        let nextStart = 0
        if (response) {
          if (inMSE) {
            log('APPENDING REST OF FILE')
            if (!FKING_FAIL)
              Log.setLogLevel(Log.debug)
            nextStart = mp4box.appendBuffer(response)
            Log.setLogLevel(Log.info)
            log('APPENDED REST OF FILE')
          } else {
            nextStart = mp4boxHdr.appendBuffer(response)
          }
        }

        if (end){
          if (mp4boxHdr)  mp4boxHdr.flush()
          if (mp4box)     mp4box.flush()
        } else {
          if (!FETCH_ENTIRE_FILE  &&  mp4boxHdr.readySent) {
            downloader.stop()

            // This is where things get real...
            // Write *JUST* the header, into the *NEW* mp4box var.
            // (The header always seems to nicely appear magically in
            //  buffers[0], extending the base buffer size if/as needed,
            //  until the entire header is read.  All of that
            //  sort of makes sense so the entire header can be parsed via
            //  a single buffer, etc.)
            // "Rewind" the downloader parser to *just* after the header.
            // Set the next chunk we will download to there, and keep going,
            // writing the rest of the mp4 file to the *NEW* mp4box var
            // (which will be writing to MediaSource and thus our <video> tag).
            const origHeaderSize = mp4boxHdr.inputStream.buffers[0].usedBytes
            log('ORIG HEADER SIZE: ' + origHeaderSize)
            FETCH_ENTIRE_FILE = true
            inMSE = true

            let skip_from_start = 0
            if (REWRITE) {
              // REWRITE THE HEADER!
              ablog(mp4boxHdr.inputStream.buffers[0])
              skip_from_start = MP4cut.cut() //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
              mp4boxHdr.flush()
              ablog(mp4boxHdr.inputStream.buffers[0])
            }


            // now try to take the updated "mp4boxHdr" object (just a header now)
            // and dump it to a buffer that we *THEN* dump into empty "mp4box" object
            var arybuf=false;
            var REALLOC = false;//xxx
            mp4boxHdr.flush();
            if (1){ // xxx which technique?!  this one seems to have more complete header/lead so going w/ it..
              arybuf = mp4boxHdr.writeFile();
              log("new moov header size: "+arybuf.byteLength);

              if (REALLOC){
                var usedBytes = ablog(arybuf) - 2;//xxxxxx -2??
                log('   ******   REALLOC '+DOWNLOADER_CHUNK_SIZE+' MORE BYTES   *******');
                var xxx=new DataStream(arybuf, 0, DataStream.BIG_ENDIAN);
                xxx._realloc(DOWNLOADER_CHUNK_SIZE);
                arybuf = xxx.buffer;
                arybuf.usedBytes = usedBytes;
              }
            }
            else if (1){
              // UGH!  try to write directly into YOUR OWN INPUT BUFFER!
	            var stream = new DataStream(mp4boxHdr.inputStream.buffers[0], 0, DataStream.BIG_ENDIAN);
	            mp4boxHdr.inputIsoFile.write(stream);
            }
            else {
              // write new header to a DataStream / buffer (xxx this could prolly be more efficient)
              var xxx=new DataStream();
              xxx.endianness = DataStream.BIG_ENDIAN;
              mp4boxHdr.inputIsoFile.moov.write(xxx);
              log("new moov header size: "+xxx.byteLength);
              arybuf = xxx.buffer;//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
              //arybuf.usedBytes = xxx.byteLength;//xxx ugh
            }

            downloader.stop()
            downloader = null // xxx delete
            downloader = downloaderNEW() // xxx2020 ugh, omg...

            //arybuf.fileStart = arybuf.usedBytes = 50787; //xxx ugh
            if (arybuf){
              arybuf.fileStart = 0; //xxx ugh
              ablog(arybuf);
            }
            ablog(mp4boxHdr.inputStream.buffers[0]);
            if (FKING_FAIL) //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx FUCKING FAIL
              arybuf = mp4boxHdr.inputStream.buffers[0];///xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  this works but not the other buffer (!!)

            mp4boxNEW()
//debugger;
log('APPENDING TO NEW mp4box')
            Log.setLogLevel(Log.debug)
            mp4box.appendBuffer(arybuf)
            Log.setLogLevel(Log.info)
log('APPENDED  TO NEW mp4box')
            mp4box.flush()
            mp4boxHdr = null // xxx delete


            nextStart = origHeaderSize + skip_from_start;
            log('NEXT START: ' + nextStart);
//if (nextStart < 65536) nextStart=65536; //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//if (nextStart < 65536) nextStart=50787; //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

            downloader.setChunkStart(nextStart);
            downloader.resume();
          } else {
            log('DL fetching '+FILE+' bytes starting at: ' + nextStart);
            downloader.setChunkStart(nextStart);
          }
        }
        if (error)
          throw "DOWNLOADER ERROR";
      })//end downloader.setCallback()

      return downloader
    } // end downloaderNEW()

    const downloadernew = downloaderNEW()
    downloadernew.start()
  } // end constructor()




  static stts_get_duration(stts) {
    let duration = 0
    for(let i = 0; i < stts.sample_counts.length; i++)
      duration += stts.sample_counts[i] * stts.sample_deltas[i]
    return duration
  }


  static trak_time_to_moov_time(t, moov_time_scale, trak_time_scale) {
    return t * moov_time_scale / trak_time_scale
  }


  static dumpSTCO(mp4, only) {
    const moov = mp4.inputIsoFile.moov
    for (const trak in moov.traks) {
      if (typeof only !== 'undefined'  &&  trak !== only)
        continue
      log('STCO, trak:', trak, ' ( '+moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.length,
          ' offsets)')
      log(moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[0])
      log(moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[1])
      log(moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets)
    }
  }


  resetMediaSource() {
    const video = document.getElementById('vxxx')
    this.mediaSource.video = video
    video.ms = this.mediaSource
    video.src = window.URL.createObjectURL(this.mediaSource)
    log('MS RESET')

    log('mediaSource.readyState:', this.mediaSource.readyState)
  }


  initializeSourceBuffersAndSegmentation(info) {
    log("initializeSourceBuffersAndSegmentation() has info");
    if (this.mediaSource.readyState !== 'open') {
      setTimeout(() => this.initializeSourceBuffersAndSegmentation(info), 1000);//xxxx
      return
    }


    for (let i = 0; i < info.tracks.length; i++) {
      const track = info.tracks[i]
      log(`addbuffer() now for track ${i}`)
      this.addBuffer(video, track)
    }


    this.mediaSource.duration = info.duration/info.timescale //xxx

    const initSegs = mp4box.initializeSegmentation()
    for (var i = 0; i < initSegs.length; i++) {
      var sb = initSegs[i].user
      if (i === 0)
        sb.ms.pendingInits = 0

      sb.addEventListener('updateend', MP4cut.onInitAppended)
      Log.info(`MSE - SourceBuffer #${sb.id},
        Appending initialization data`)
      sb.appendBuffer(initSegs[i].buffer)
      sb.segmentIndex = 0
      sb.ms.pendingInits++
    }
  }


  addBuffer(video, mp4track) {
    var track_id = mp4track.id
    var codec = mp4track.codec
    var mime = 'video/mp4; codecs=\"'+codec+'\"'
    var kind = mp4track.kind
    if (MediaSource.isTypeSupported(mime)) {
      try {
        Log.info("MSE - SourceBuffer #"+track_id,"Creation with type '"+mime+"'");
        const sb = this.mediaSource.addSourceBuffer(mime);
        sb.addEventListener("error", function(e) {
          Log.error("MSE SourceBuffer #"+track_id,e);
        });
        sb.ms = this.mediaSource
        sb.id = track_id;
        mp4box.setSegmentOptions(track_id, sb, { nbSamples: SEGMENT_NUMBER_SAMPLES, rapAlignement:true } );
        sb.pendingAppends = [];
      } catch (e) {
        Log.error("MSE - SourceBuffer #"+track_id,"Cannot create buffer with type '"+mime+"'" + e);
      }
    } else {
      Log.warn("MSE", "MIME type '"+mime+"' not supported for creation of a SourceBuffer for track id "+track_id);
    }
  }




  static updateBufferedString(sb, string) {
    if (sb.ms.readyState === "open") {
      const rangeString = Log.printRanges(sb.buffered);
      Log.info("MSE - SourceBuffer #"+sb.id, string+", updating: "+sb.updating+", currentTime: "+Log.getDurationString(video.currentTime, 1)+", buffered: "+rangeString+", pending: "+sb.pendingAppends.length);
      if (sb.bufferTd === undefined)
        sb.bufferTd = document.getElementById("buffer"+sb.id);
    }
  }


  static onInitAppended(e) {
    const sb = e.target
    if (sb.ms.readyState === 'open') {
      MP4cut.updateBufferedString(sb, 'Init segment append ended')
      sb.sampleNum = 0
      sb.removeEventListener('updateend', MP4cut.onInitAppended)
      sb.addEventListener('updateend', () => MP4cut.onUpdateEnd(sb, true, true))
      /* In case there are already pending buffers we call onUpdateEnd to start appending them*/
      MP4cut.onUpdateEnd(sb, false, true)
      sb.ms.pendingInits--
      if (autoplay  &&  sb.ms.pendingInits === 0)
        mp4box.start()
    }
  }


  // NOTE: previously all these - was self/this intermixed!
  static onUpdateEnd(sb, isNotInit, isEndOfAppend) {
    if (isEndOfAppend === true) {
      if (isNotInit === true) {
        MP4cut.updateBufferedString(sb, 'Update ended')
      }
      if (sb.sampleNum) {
        mp4box.releaseUsedSamples(sb.id, sb.sampleNum)
        delete sb.sampleNum
      }
    }

    if (sb.ms.readyState === 'open' && !sb.updating && sb.pendingAppends.length > 0) {
      const obj = sb.pendingAppends.shift()
      Log.info("MSE - SourceBuffer #"+sb.id, "Appending new buffer, pending: "+sb.pendingAppends.length)
      sb.sampleNum = obj.sampleNum
      sb.appendBuffer(obj.buffer)
    }
  }




  static cut() {
    var mp4 = mp4boxHdr // xxx

    // compute CURRENT (FULL) moov header size
    let tmpxxx = mp4.writeFile()
    var old_moov_size = tmpxxx.byteLength;
    log("OLD moov size: "+old_moov_size);
    tmpxxx = null // xxx delete


    window.moov = mp4.inputIsoFile.moov;//xxxx
    window.mdat = mp4.inputIsoFile.mdats[0];//xxxx
    var moov_time_scale = moov.mvhd.timescale;

    var nearestKeyframe=0;
    var nearestKeyframeTrak=-1;
    var starts=[]; // NOTE: these become starting sample *NUMBER* (not time!) for each track
    var ends=[];   // NOTE: these become ending   sample *NUMBER* (not time!) for each track
    for (var trak in moov.traks){
      log('================== NEW TRAK ===================');
      var trak_time_scale = moov.traks[trak].mdia.mdhd.timescale;
      log('stco (chunk offsets)');
      //log(moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets);
      log('stts (time to sample) (always len 1 for IA vids):');
      log(moov.traks[trak].mdia.minf.stbl.stts);

      var duration = moov.traks[trak].mdia.minf.stbl.stts.sample_deltas[0]; //xxx may need to expand for non-IA (they have just 1)...
      var duration_time = duration / trak_time_scale; //eg: 100/2997


      // find the actually wanted start and end, after initing to max range
      starts[trak] = 0;
      ends[trak] = moov.traks[trak].samples.length-1;
      for (var i=0; i < moov.traks[trak].samples.length; i++){
        var pts = i * duration / trak_time_scale;
        if (pts <= START)
          starts[trak] = i;
        if (pts <= END)
          ends[trak] = i;
        else if (pts > END)
          break;
      }



      // now for the video track, adjust ITS start to the nearest keyframe BEFORE OR AT it
      if (moov.traks[trak].mdia.minf.stbl.stss){
        log('moov_time_scale:'+moov_time_scale);
        log('trak_time_scale:'+trak_time_scale);
        log('stss (list of video keyframes)');
        var sample_numbers=moov.traks[trak].mdia.minf.stbl.stss.sample_numbers;
        console.log(sample_numbers);
        for (var i in sample_numbers){
          // pts:  179*100/2997 ==> 5.972639305972639
          var pts=(sample_numbers[i]-1) * duration / trak_time_scale;//xxx check the -1 math, etc.
          log('keyframe #'+i+', val='+sample_numbers[i]+', pts='+pts+', vs START='+START);
          if (pts <= START){
            nearestKeyframeTrak = trak;
            nearestKeyframe = sample_numbers[i] - 1; // xxxxxxxxxxx go from 1-based to 0-based index into other arrays!
          }
          if (pts >= START)
            break;
        }
        log('nearestKeyframe: '    + nearestKeyframe); // xxx this is a sample NUMBER (not time)!
      }
    }//end for (var trak in moov.traks)




    if (nearestKeyframeTrak >= 0){
      // means we found the best VIDEO KEYFRAME to sync start to above -- we'll use that!
      log('STARTS: ');log(starts);
      starts[nearestKeyframeTrak] = nearestKeyframe;
    }
    log('STARTS: ');log(starts);
    log('ENDS: '  );log(ends);


    if (0 && "xxx"){
      starts=[272,391];
      ends=[521,749];
      log('STARTS: ');log(starts);
      log('ENDS: '  );log(ends);
    }




    var moov_duration = 0;
    var end_offset = 0;
    var skip_from_start = Number.MAX_VALUE;
    var mdat_start = mdat.start;//xxxx
    var mdat_size = mdat.size;//xxxx
    for (var trak in moov.traks){
      var start = starts[trak];
      var end   = ends[trak];

      var skip = (moov.traks[trak].samples[start].offset -
                  moov.traks[trak].samples[0].offset);
      if (skip < skip_from_start){
        skip_from_start = skip;
        log('CAN SKIP '+skip+' BYTES! (starting with sample #'+start+' in trak #'+trak+' which is now at byte '+(moov.traks[trak].samples[start].offset)+')');
      }

      if ((end+1) < moov.traks[trak].samples.length){
        var end_pos = moov.traks[trak].samples[end].offset;
        if(end_pos > end_offset)
          end_offset = end_pos;
        log("New endpos=" + end_pos);
        log("Trak can skip "+(mdat_start + mdat_size - end_offset)+" bytes at end");
      }

      // adust STTS
      if (moov.traks[trak].mdia.minf.stbl.stts){
        var samples = moov.traks[trak].samples;
        var entries = 0;
        var s = start;
        var sample_counts=[];
        var sample_deltas=[];
        while (s != end){
          var sample_count=1;
          //log(s+' -v- '+end);
          var sample_duration = samples[s+1].dts - samples[s].dts;
          while ((++s) < end){
            //log(s+' -v- '+end);
            if ((samples[s+1].dts - samples[s].dts) != sample_duration){
              alert('xxx');
              break;
            }
            ++sample_count;
          }

          sample_counts[entries] = sample_count;
          sample_deltas[entries] = sample_duration;
          entries++;
        }
        moov.traks[trak].mdia.minf.stbl.stts.sample_counts = sample_counts;
        moov.traks[trak].mdia.minf.stbl.stts.sample_deltas = sample_deltas;
      }

      // adjust CTTS
      if (moov.traks[trak].mdia.minf.stbl.ctts) alert("need to update CTTS!");

      // adjust STSC (chunkmap) and STCO (chunk offsets)
      if (moov.traks[trak].mdia.minf.stbl.stsc){
        var stsc = moov.traks[trak].mdia.minf.stbl.stsc;

        // find the chunk that has the desired start sample in it
        var chunk_start=0;
        if (!stsc.first_chunk.length  &&
            !stsc.samples_per_chunk.length  &&
            !stsc.sample_description_index.length){
          // eg: MP4Box -dash 10000 -rap -frag-rap c.mp4
          alert('is this a problem xxx?!');
        }
        else{
          // eg: normal IA video
          //debugger;//xxx
          for (var nChunks=stsc.samples_per_chunk.length/*xxx verify!*/;   chunk_start < nChunks; chunk_start++){
            if (stsc.first_chunk[nChunks] + stsc.samples_per_chunk[nChunks] > start)
              break; // found the right chunk!
          }
          if (stsc.first_chunk.length!=1  ||  stsc.first_chunk[0]!=1  ||
              stsc.samples_per_chunk.length!=1  ||  stsc.samples_per_chunk[0]!=1  ||
              stsc.sample_description_index.length!=1  ||  stsc.sample_description_index[0]!=1){
            alert('cant be this lazy tracey STSC needs work xxx!');
          }
        }
        var chunk_end=moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.length;//xxx (see above alert!)
        var entries=0;
        log("====================FTW1====================");
        MP4cut.dumpSTCO(mp4, trak);

        chunk_start = start;  chunk_end = end; //xxxx  assumes 1 set of chunks AND/OR single moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets -- which prolly *IS* legit -- but axe bunch of useless work above??!?

        for (var i=chunk_start; i <= chunk_end; i++){
          moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[entries] =
          moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[i]; // xxx need to subtract amount of header we will shrink down by  *PLUS*  the first byte jump distance between orig vs ne A/V packets...
          entries++;
        }
        log("====================FTW2====================");
        moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets = moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.slice(0,entries);//xxx slice efficient enough?!
        MP4cut.dumpSTCO(mp4, trak);
      }


      // adjust STSS (sync samples)
      if (moov.traks[trak].mdia.minf.stbl.stss){
        var stss = moov.traks[trak].mdia.minf.stbl.stss;
        var i=0;
        var entries=0;
        for (; i < stss.sample_numbers.length; i++){
          var sync_sample = stss.sample_numbers[i];
          if (sync_sample >= end + 1)
            break;
          moov.traks[trak].mdia.minf.stbl.stss.sample_numbers[entries++] =
            sync_sample - start;
        }
        moov.traks[trak].mdia.minf.stbl.stss.sample_numbers = moov.traks[trak].mdia.minf.stbl.stss.sample_numbers.slice(0,entries);//xxx slice efficient enough?!
      }


      // adjust STSZ (sample sizes)
      if (moov.traks[trak].mdia.minf.stbl.stsz){
        var stsz = moov.traks[trak].mdia.minf.stbl.stsz;
        if (stsz.sample_sizes.length){
          var entries=0;
          for (var i=start; i < end; i++)
            moov.traks[trak].mdia.minf.stbl.stsz.sample_sizes[entries++] = stsz.sample_sizes[i];
          moov.traks[trak].mdia.minf.stbl.stsz.sample_sizes = moov.traks[trak].mdia.minf.stbl.stsz.sample_sizes.slice(0,entries);//xxx slice efficient enough?!
        }
      }


      // fixup trak (duration)
      var trak_duration = MP4cut.stts_get_duration(moov.traks[trak].mdia.minf.stbl.stts);
      var trak_time_scale =  moov.traks[trak].mdia.mdhd.timescale;
      {
        var duration = MP4cut.trak_time_to_moov_time(trak_duration, moov_time_scale, trak_time_scale);
        moov.traks[trak].mdia.mdhd.duration = trak_duration;
        moov.traks[trak].tkhd.duration = duration;
        log('trak: new duration: ' + duration);

        if (duration > moov_duration)
          moov_duration = duration;
      }
    } // end for (var trak in moov.traks)


    moov.mvhd.duration = moov_duration;
    log('moov: new_duration=', moov_duration / moov_time_scale, ' seconds')

    // subtract bytes we skip at the front of the mdat atom
    let offset = 0 - skip_from_start
    log('shifting offsets by ', offset)

    log('moov: writing header')

    // compute NEW moov header size
    let tmpxxx2 = mp4.writeFile()
    const new_moov_size = tmpxxx2.byteLength
    log('NEW moov size: ', new_moov_size)
    tmpxxx2 = null // delete

    // add shrink in moov size
    offset -= (old_moov_size - new_moov_size)
    offset = 0 //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    log('shifting offsets by ', offset)

    // moov_shift_offsets_inplace(moov, offset);
    MP4cut.dumpSTCO(mp4boxHdr)
    for (let trak in moov.traks) {
      for (let i=0; i < moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.length; i++)
        moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[i] += offset
    }//end for (var trak in moov.traks)
    MP4cut.dumpSTCO(mp4boxHdr)


    //create_traffic_shaping(moov, ... //xxx ??!

    return skip_from_start
  } // end cut()
}



$(() => {
  // on dom ready...
  // if (location.hostname === 'localhost')
  new MP4cut('commute.mp4')//, 60, 70)
})
