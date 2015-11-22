/* main functions, MSE-related */

const SEGMENT_NUMBER_SAMPLES = 1000;
const FETCH_ENTIRE_FILE = true;
const DOWNLOADER_CHUNK_SIZE = 2000000; // ~1.9MB
const autoplay = true;
const FI='commute.mp4';
var video = false;

window.mediaSource = new MediaSource();
Log.setLogLevel(Log.info);

var log=function(){
  for (arg in arguments)
    $('#log').append(arguments[arg]+"\n");
  if (typeof(console)=='undefined')
    return;
  console.log(arguments);
};



function resetMediaSource() {
  video = document.getElementById('vxxx');  
	mediaSource.video = video;
	video.ms = mediaSource;
	video.src = window.URL.createObjectURL(mediaSource);
  log("MS RESET");

  log('mediaSource.readyState:');
  log(mediaSource.readyState)

  log('mediaSource.readyState:');
  log(mediaSource.readyState)
}


function initializeAllSourceBuffers(info) {
  log("initializeAllSourceBuffers() has info");
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
//      debugger;
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








resetMediaSource();  //xxxx
video.play();
 
window.mp4box = new MP4Box();
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
	if (mediaSource.readyState === "open")
    initializeAllSourceBuffers(info);
  else
    setTimeout(function(){ initializeAllSourceBuffers(info); }, 1000);//xxxx
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
     log('end: '+end);
     var nextStart = 0;
     if (response){
       nextStart = mp4box.appendBuffer(response);
       //mediaSource.append(response);
     }
     
     if (end){
       mp4box.flush();
//mediaSource.append(mp4box.writeFile()); //xxxxxxxx
     }
     else {
       if (!FETCH_ENTIRE_FILE  &&  mp4box.readySent)
         downloader.stop();
       else
         downloader.setChunkStart(nextStart);
     }     
     if (error)
       reset();
   }
 );
  
