/* main functions, MSE-related */

/*
TODO:

xxxx   is downloader -ing 2x!
xxx=mp4box.writeFile(); // to write moov
size1=xxx.bytelength;
// ... update header
xxx=mp4box.writeFile(); // to write moov
size2=xxx.bytelength;
// the difference + (samples[start].offset - samples[0].offset)  should be the difference!



- read mp4 header
- determine seek pts
- rewrite header
- write 
- xhr dump start/end range


*/


(function( $ ) {

  function MP4cut(FILE, START, END){
    if (!FILE)
      FILE = 'http://ia600301.us.archive.org/cors_get.php?path=/27/items/stairs/stairs.mp4';
    if (!START)
      START=0;
    if (!END)
      END=10800;//xxx

    const SEGMENT_NUMBER_SAMPLES = 1000;
    const DOWNLOADER_CHUNK_SIZE = (FILE=='commute.mp4' ? 2000000 : 100000); // ~1.9MB
    const autoplay = true;
    const REWRITE = false;

    var FETCH_ENTIRE_FILE = false;
    var video = false;
    var inMSE = false;
    window.origHeaderSize = 0;//xxx
    var self = this;
    
    var mediaSource = new MediaSource();
    if (FILE=='commute.mp4')
      Log.setLogLevel(Log.info);
    else
      Log.setLogLevel(Log.debug);
    
    var log=function(){
      for (arg in arguments)
        $('#log').append(arguments[arg]+"\n");
      if (typeof(console)=='undefined')
        return;
      console.log(arguments);
    };
    log('FILE: '+FILE);



    self.debug = function(){
      debugger;
    };


    self.stts_get_duration = function(stts){
      var duration = 0;
      for(var i=0; i < stts.sample_counts.length; i++)
        duration += stts.sample_counts[i] * stts.sample_deltas[i];
      return duration;
    };
    

    self.trak_time_to_moov_time = function(t, moov_time_scale, trak_time_scale){
      return t * moov_time_scale / trak_time_scale;
    };


    self.resetMediaSource = function() {
      video = document.getElementById('vxxx');  
	    mediaSource.video = video;
	    video.ms = mediaSource;
	    video.src = window.URL.createObjectURL(mediaSource);
      log("MS RESET");
      
      log('mediaSource.readyState:');
      log(mediaSource.readyState)
    };


    self.initializeSourceBuffersAndSegmentation = function(info) {
      log("initializeSourceBuffersAndSegmentation() has info");
      if (mediaSource.readyState != 'open'){
        setTimeout(function(){ self.initializeSourceBuffersAndSegmentation(info); }, 1000);//xxxx
        return;
      }


	    for (var i = 0; i < info.tracks.length; i++) {
		    var track = info.tracks[i];
        log("addbuffer() now for track "+i);
		    self.addBuffer(video, track);
	    }
  

      mediaSource.duration = info.duration/info.timescale; //xxx
      
	    var initSegs = mp4box.initializeSegmentation();
	    for (var i = 0; i < initSegs.length; i++) {
		    var sb = initSegs[i].user;
		    if (i === 0)
			    sb.ms.pendingInits = 0;
        
		    sb.addEventListener("updateend", self.onInitAppended);
		    Log.info("MSE - SourceBuffer #"+sb.id,"Appending initialization data");
		    sb.appendBuffer(initSegs[i].buffer);
		    sb.segmentIndex = 0;
		    sb.ms.pendingInits++;
	    }
    };


    self.addBuffer = function(video, mp4track) {
	    var sb;
	    var ms = mediaSource;
	    var track_id = mp4track.id;
	    var codec = mp4track.codec;
	    var mime = 'video/mp4; codecs=\"'+codec+'\"';
	    var kind = mp4track.kind;
	    if (MediaSource.isTypeSupported(mime)) {
		    try {
			    Log.info("MSE - SourceBuffer #"+track_id,"Creation with type '"+mime+"'");
			    sb = ms.addSourceBuffer(mime);
			    sb.addEventListener("error", function(e) {
				    Log.error("MSE SourceBuffer #"+track_id,e);
			    });
			    sb.ms = ms;
			    sb.id = track_id;
			    mp4box.setSegmentOptions(track_id, sb, { nbSamples: SEGMENT_NUMBER_SAMPLES, rapAlignement:true } );
			    sb.pendingAppends = [];
		    } catch (e) {
			    Log.error("MSE - SourceBuffer #"+track_id,"Cannot create buffer with type '"+mime+"'" + e);
		    }
	    } else {
		    Log.warn("MSE", "MIME type '"+mime+"' not supported for creation of a SourceBuffer for track id "+track_id);
	    }
    };


				


    self.updateBufferedString = function(sb, string) {
	    var rangeString;
	    if (sb.ms.readyState === "open") {
		    rangeString = Log.printRanges(sb.buffered);
		    Log.info("MSE - SourceBuffer #"+sb.id, string+", updating: "+sb.updating+", currentTime: "+Log.getDurationString(video.currentTime, 1)+", buffered: "+rangeString+", pending: "+sb.pendingAppends.length);
		    if (sb.bufferTd === undefined)
			    sb.bufferTd = document.getElementById("buffer"+sb.id);
	    }
    };



    self.onInitAppended = function(e) {
	    var sb = e.target;
	    if (sb.ms.readyState === "open") {
		    self.updateBufferedString(sb, "Init segment append ended");
		    sb.sampleNum = 0;
		    sb.removeEventListener('updateend', self.onInitAppended);
		    sb.addEventListener('updateend', self.onUpdateEnd.bind(sb, true, true));
		    /* In case there are already pending buffers we call onUpdateEnd to start appending them*/
		    self.onUpdateEnd.call(sb, false, true);
		    sb.ms.pendingInits--;
		    if (autoplay  &&  sb.ms.pendingInits === 0)
			    mp4box.start();
	    }
    };


    self.onUpdateEnd = function(isNotInit, isEndOfAppend) {
	    if (isEndOfAppend === true) {
		    if (isNotInit === true) {
			    self.updateBufferedString(this, "Update ended");
		    }
		    if (this.sampleNum) {
			    mp4box.releaseUsedSamples(this.id, this.sampleNum);
			    delete this.sampleNum;
		    }
	    }
	    if (this.ms.readyState === "open" && this.updating === false && this.pendingAppends.length > 0) {
		    var obj = this.pendingAppends.shift();
		    Log.info("MSE - SourceBuffer #"+this.id, "Appending new buffer, pending: "+this.pendingAppends.length);
		    this.sampleNum = obj.sampleNum;
		    this.appendBuffer(obj.buffer);
	    }
    };





    // xxxxx now move the new MP4Box() stuff above here...
    self.resetMediaSource();  //xxxx
    video.play();
 
    window.mp4boxHdr = new MP4Box();//xxx
    window.mp4box    = new MP4Box();//xxx
    mp4boxHdr.onMoovStart = function () {
      log("HDR Starting to receive File Information");
    }
    mp4boxHdr.onError = function(e) {
      log("HDR error:");
      log(e);
    };
    mp4boxHdr.onReady = function(info) {
      log("HDR onReady info:");
      log(info);
    };


    
    mp4box.onReady = function(info){
      log("onReady info:");
      log(info);
      self.initializeSourceBuffersAndSegmentation(info);
    };
    
    mp4box.onSegment = function (id, user, buffer, sampleNum) {	//xxxxx
	    var sb = user;
	    sb.segmentIndex++;
	    sb.pendingAppends.push({ id: id, buffer: buffer, sampleNum: sampleNum });
	    Log.info("Application","Received new segment for track "+id+" up to sample #"+sampleNum+", segments pending append: "+sb.pendingAppends.length);
	    self.onUpdateEnd.call(sb, true, false);
    };



    var downloader = new Downloader();
    downloader.setInterval(100);
    downloader.setChunkSize(DOWNLOADER_CHUNK_SIZE);
    downloader.setUrl(FILE);
    downloader.start();


    
    downloader.setCallback(
      function (response, end, error) { 
        log('DL callback()');
        log('DL end: '+end);
        log('DL response #bytes: ' + response.byteLength);
        // response == ArrayBuffer;  response.usedBytes -v- response.byteLength
        /*xxxx
          var s=new DataStream();
          s.endianness = DataStream.BIG_ENDIAN;
          mp4box.inputIsoFile.write(s);
          s.buffer == ArrayBuffer!
          s.buffer.byteLength == moov header size (50787 B) too for commute.mp4
          
          before all flush() change things
          mp4box.inputStream.buffers[0].usedBytes *seems* to be the header and size of it...



          s=new DataStream();  s.endianness=DataStream.BIG_ENDIAN;  x=mp4boxHdr.inputIsoFile.moov.write(s);  s.byteLength
          

          
          once readySent() (have (just) header):
          MSE setup
          range request next chunk to mp4box
          range request next chunk to mp4box
          
          rewrite header (tracey)
          downloader range request new wanted A/V range of bytes
          self.initializeSourceBuffersAndSegmentation(info);
        */
        

        var nextStart = 0;
        if (response){
          if (inMSE)
            nextStart = mp4box.appendBuffer(response);
          else
            nextStart = mp4boxHdr.appendBuffer(response);
        }
     
        if (end){
          mp4boxHdr.flush();
          mp4box.flush();
        }
        else {
          if (!FETCH_ENTIRE_FILE  &&  mp4boxHdr.readySent){
            downloader.stop();
            
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
            origHeaderSize = mp4boxHdr.inputStream.buffers[0].usedBytes;
            var skip_from_start = 0;
            if (REWRITE){
              // REWRITE THE HEADER!
              skip_from_start = self.cut();
              // write new header to a DataStream / buffer (xxx this could prolly be more efficient)
              var xxx=new DataStream();
              xxx.endianness = DataStream.BIG_ENDIAN;  
              mp4boxHdr.inputIsoFile.moov.write(xxx);
              xxx._buffer.fileStart = 0; //xxx ugh
              mp4box.appendBuffer(xxx._buffer);
              // xxx.byteLength  // new header size!
            }
            else {
              mp4box.appendBuffer(mp4boxHdr.inputStream.buffers[0]);
            }
            log('ORIG HEADER SIZE: ' + origHeaderSize);
            nextStart = origHeaderSize + skip_from_start;
            log('NEXT START: ' + nextStart);
            downloader.setChunkStart(nextStart);
            FETCH_ENTIRE_FILE = true;
            inMSE = true;
            downloader.resume();
          }
          else{
            log('DL fetching '+FILE+' bytes starting at: ' + nextStart);
            downloader.setChunkStart(nextStart);
          }
        }     
        if (error)
          reset();
      }
    );//end downloader.setCallback
  

    

    self.cut = function(){
      var mp4 = mp4boxHdr;//xxx
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
          log(moov.traks[trak].mdia.minf.stbl.stss.sample_numbers);
          var sample_numbers=moov.traks[trak].mdia.minf.stbl.stss.sample_numbers;
          for (var i in sample_numbers){
            // pts:  179*100/2997 ==> 5.972639305972639
            var pts=(sample_numbers[i]-1) * duration / trak_time_scale;//xxx check the -1 math, etc.
            if (pts <= START){
              nearestKeyframeTrak = trak;
              nearestKeyframe = sample_numbers[i];
            }
            else{
              break;
            }
            
            log('keyframe #: '+i+', val='+sample_numbers[i]+', pts='+pts);
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
        if (skip < skip_from_start)
          skip_from_start = skip;
        log('CAN SKIP '+skip+' BYTES!');
        
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
          }
          else{
            // eg: normal IA video
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
          for (var i=chunk_start; i < chunk_end; i++){
            moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[entries] =
            moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[i]; // xxx need to subtract amount of header we will shrink down by  *PLUS*  the first byte jump distance between orig vs ne A/V packets...
            entries++;
          }
          moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets = moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.slice(0,entries);//xxx slice efficient enough?!
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
        var trak_duration = self.stts_get_duration(moov.traks[trak].mdia.minf.stbl.stts);
        var trak_time_scale =  moov.traks[trak].mdia.mdhd.timescale;
        {
          var duration = self.trak_time_to_moov_time(trak_duration, moov_time_scale, trak_time_scale);
          moov.traks[trak].mdia.mdhd.duration = trak_duration;
          moov.traks[trak].tkhd.duration = duration;
          log('trak: new duration: ' + duration);
          
          if (duration > moov_duration)
            moov_duration = duration;
        }
      }//end for (var trak in moov.traks)


      moov.mvhd.duration = moov_duration;
      log("moov: new_duration="+(moov_duration / moov_time_scale)+" seconds");

      // subtract bytes we skip at the front of the mdat atom
      var offset = 0 - skip_from_start;
      log("shifting offsets by " + offset);   
      
      log("moov: writing header");

      // compute moov header size
      var tmpxxx = mp4.writeFile();
      var moov_size = tmpxxx.byteLength;
      log("moov size: "+moov_size);
      delete tmpxxx;
      
      // add new moov size
      offset += moov_size;
      log("shifting offsets by " + offset);
      
      // moov_shift_offsets_inplace(moov, offset);
      for (var trak in moov.traks){
        for (var i=0; i < moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets.length; i++)
          moov.traks[trak].mdia.minf.stbl.stco.chunk_offsets[i] += offset;
      }//end for (var trak in moov.traks)
      
      
      //create_traffic_shaping(moov, ... //xxx ??!

      return skip_from_start;
    };//end self.cut


  }//end function MP4cut..


  // make it so we can do "new MP4cut()" internally (only):
  MP4cut.prototype.constructor = MP4cut; 
  // make it so we can do "new MP4cut(FILE, START, END)" globally:
  window.MP4cut = function(FILE, START, END){ return new MP4cut(FILE, START, END); };

}( jQuery ));



jQuery(function(){
  // on dom ready...
//  mp4cut = new MP4cut();
  mp4cut = new MP4cut('commute.mp4', 0, 120); //10, 20);//xxx
});