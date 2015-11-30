/* main functions, MSE-related */

/*
TODO:

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

const SEGMENT_NUMBER_SAMPLES = 1000;
var   FETCH_ENTIRE_FILE = false;
const FI='commute.mp4';
//const FI='stairs.mp4';
const DOWNLOADER_CHUNK_SIZE = (FI=='commute.mp4' ? 2000000 : 100000); // ~1.9MB
const autoplay = true;
var video = false;
var inMSE = false;

window.mediaSource = new MediaSource();
if (FI=='stairs.mp4')
  Log.setLogLevel(Log.debug);
else
  Log.setLogLevel(Log.info);

var log=function(){
  for (arg in arguments)
    $('#log').append(arguments[arg]+"\n");
  if (typeof(console)=='undefined')
    return;
  console.log(arguments);
};
log('FILE: '+FI);


function resetMediaSource() {
  video = document.getElementById('vxxx');  
	mediaSource.video = video;
	video.ms = mediaSource;
	video.src = window.URL.createObjectURL(mediaSource);
  log("MS RESET");

  log('mediaSource.readyState:');
  log(mediaSource.readyState)
}


function initializeSourceBuffersAndSegmentation(info) {
  log("initializeSourceBuffersAndSegmentation() has info");
  if (mediaSource.readyState != 'open'){
    setTimeout(function(){ initializeSourceBuffersAndSegmentation(info); }, 1000);//xxxx
    return;
  }


	for (var i = 0; i < info.tracks.length; i++) {
		var track = info.tracks[i];
    log("addbuffer() now for track "+i);
		addBuffer(video, track);
	}
  

  mediaSource.duration = info.duration/info.timescale; //xxx
  
	var initSegs = mp4box.initializeSegmentation();
	for (var i = 0; i < initSegs.length; i++) {
		var sb = initSegs[i].user;
		if (i === 0)
			sb.ms.pendingInits = 0;

		sb.addEventListener("updateend", onInitAppended);
		Log.info("MSE - SourceBuffer #"+sb.id,"Appending initialization data");
		sb.appendBuffer(initSegs[i].buffer);
		sb.segmentIndex = 0;
		sb.ms.pendingInits++;
	}


  //mp4box.seek(30,true);//xxxx
}


function addBuffer(video, mp4track) {
	var sb;
	var ms = window.mediaSource;//video.ms;//xxxx
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
}


				


function updateBufferedString(sb, string) {
	var rangeString;
	if (sb.ms.readyState === "open") {
		rangeString = Log.printRanges(sb.buffered);
		Log.info("MSE - SourceBuffer #"+sb.id, string+", updating: "+sb.updating+", currentTime: "+Log.getDurationString(video.currentTime, 1)+", buffered: "+rangeString+", pending: "+sb.pendingAppends.length);
		if (sb.bufferTd === undefined)
			sb.bufferTd = document.getElementById("buffer"+sb.id);
	}
}



function onInitAppended(e) {
	var sb = e.target;
	if (sb.ms.readyState === "open") {
		updateBufferedString(sb, "Init segment append ended");
		sb.sampleNum = 0;
		sb.removeEventListener('updateend', onInitAppended);
		sb.addEventListener('updateend', onUpdateEnd.bind(sb, true, true));
		/* In case there are already pending buffers we call onUpdateEnd to start appending them*/
		onUpdateEnd.call(sb, false, true);
		sb.ms.pendingInits--;
		if (autoplay  &&  sb.ms.pendingInits === 0)
			mp4box.start();
	}
}

function onUpdateEnd(isNotInit, isEndOfAppend) {
	if (isEndOfAppend === true) {
		if (isNotInit === true) {
			updateBufferedString(this, "Update ended");
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
}










resetMediaSource();  //xxxx
video.play();
 
window.mp4boxHdr = new MP4Box();
window.mp4box    = new MP4Box();
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
  initializeSourceBuffersAndSegmentation(info);
};

mp4box.onSegment = function (id, user, buffer, sampleNum) {	//xxxxx
	var sb = user;
	sb.segmentIndex++;
	sb.pendingAppends.push({ id: id, buffer: buffer, sampleNum: sampleNum });
	Log.info("Application","Received new segment for track "+id+" up to sample #"+sampleNum+", segments pending append: "+sb.pendingAppends.length);
	onUpdateEnd.call(sb, true, false);
};



 var downloader = new Downloader();
 downloader.setInterval(100);
 downloader.setChunkSize(DOWNLOADER_CHUNK_SIZE);
 downloader.setUrl(FI);
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



       once readySent() (have (just) header):
       MSE setup
       range request next chunk to mp4box
       range request next chunk to mp4box

       rewrite header (tracey)
       downloader range request new wanted A/V range of bytes
       initializeSourceBuffersAndSegmentation(info);
     */

     // (NOTE: tracey extending downloader w/ instance var)
     downloader.nextStart = 0;
     if (response){
       if (inMSE)
         downloader.nextStart = mp4box.appendBuffer(response);
       else
         downloader.nextStart = mp4boxHdr.appendBuffer(response);
     }
     
     if (end){
       mp4boxHdr.flush();
       mp4box.flush();
     }
     else {
       if (!FETCH_ENTIRE_FILE  &&  mp4boxHdr.readySent){
         downloader.stop();
         
         // Tthis is where things get real...
         // Write *JUST* the header, into the *NEW* mp4box var.
         // "Rewind" the downloader parser to *just* after the header.
         // Set the next chunk to download to there, and keep going!
         mp4box.appendBuffer(mp4boxHdr.inputStream.buffers[0]);
         var headerSize = mp4boxHdr.inputStream.buffers[0].usedBytes;
         log('HEADER SIZE: ' + headerSize);
         downloader.nextStart = headerSize;
         downloader.setChunkStart(downloader.nextStart);
         FETCH_ENTIRE_FILE = true;
         inMSE = true;
         downloader.resume();
       }
       else{
         log('DL fetching '+FI+' bytes starting at: ' + downloader.nextStart);
         downloader.setChunkStart(downloader.nextStart);
       }
     }     
     if (error)
       reset();
   }
 );
  




//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////


(function( $ ) {
  var FILE = 'http://ia600301.us.archive.org/cors_get.php?path=/27/items/stairs/stairs.mp4';
  FILE = 'commute.mp4';
  var START = 10;
  var END = 20
  const FETCH_ENTIRE_FILE=true;
  const fragment=false;
  
  const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';


  var MP4cut = {};

  MP4cut.prototype.constructor = function(FILE, START, END){
    var mp4cut = this;

    window.mp4box = new MP4Box();//xxx var
    mp4box.onMoovStart = function () {
      log("Starting to receive File Information");
    }
    mp4box.onError = function(e) {
      log("error:");
      log(e);
    };
    mp4box.onReady = function(info) {
      log("onReady info:");
      log(info);
      
      mp4cut.cut();
    }

  };

    
  MP4cut.prototype.cut = function(){

     mp4box.stop();//xxxx no work?
   
     var stts_get_duration = function(stts){
       var duration = 0;
       for(var i=0; i < stts.sample_counts.length; i++)
         duration += stts.sample_counts[i] * stts.sample_deltas[i];
       return duration;
     };
     
     var trak_time_to_moov_time = function(t, moov_time_scale, trak_time_scale){
       return t * moov_time_scale / trak_time_scale;
     };

   
   window.moov = mp4box.inputIsoFile.moov;
   window.mdat = mp4box.inputIsoFile.mdats[0];
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
     var trak_duration = stts_get_duration(moov.traks[trak].mdia.minf.stbl.stts);
     var trak_time_scale =  moov.traks[trak].mdia.mdhd.timescale;
     {
       var duration = trak_time_to_moov_time(trak_duration, moov_time_scale, trak_time_scale);
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
   var tmpxxx = mp4box.writeFile();
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
   }; //end MP4cut.prototype.cut()

}( jQuery ));