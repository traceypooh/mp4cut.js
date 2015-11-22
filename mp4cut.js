/* main functions, MSE-related */

var SEGMENT_NUMBER_SAMPLES = 1000;
var video = false;
var autoplay = true;
var FI='../stairs.mp4';
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
	mediaSource.addEventListener("sourceopen", onSourceOpen);
	mediaSource.addEventListener("sourceclose", onSourceClose);
	video.src = window.URL.createObjectURL(mediaSource);
  log("MS RESET");

  log('mediaSource.readyState:');
  log(mediaSource.readyState)

  log('mediaSource.readyState:');
  log(mediaSource.readyState)
}


function initializeAllSourceBuffers(info) {
	if (info) {
    log("initializeAllSourceBuffers() has info");
		for (var i = 0; i < info.tracks.length; i++) {
			var track = info.tracks[i];
      log("addbuffer() now for track "+i);
			addBuffer(video, track);
			//var checkBox = document.getElementById("addTrack"+track.id);
			//checkBox.checked = true;
		}
		initializeSourceBuffers2(info);
	}
}


function initializeSourceBuffers2(info) {

  mediaSource.duration = info.duration/info.timescale; //xxx
  debugger;
  
	var initSegs = mp4box.initializeSegmentation();
	for (var i = 0; i < initSegs.length; i++) {
		var sb = initSegs[i].user;
		if (i === 0) {
			sb.ms.pendingInits = 0;
		}
		sb.addEventListener("updateend", onInitAppended);
		Log.info("MSE - SourceBuffer #"+sb.id,"Appending initialization data");
		sb.appendBuffer(initSegs[i].buffer);
		sb.segmentIndex = 0;
		sb.ms.pendingInits++;
	}
	//initAllButton.disabled = true;	
	//initButton.disabled = true;
}


				


function updateBufferedString(sb, string) {
	var rangeString;
	if (sb.ms.readyState === "open") {
		rangeString = Log.printRanges(sb.buffered);
		Log.info("MSE - SourceBuffer #"+sb.id, string+", updating: "+sb.updating+", currentTime: "+Log.getDurationString(video.currentTime, 1)+", buffered: "+rangeString+", pending: "+sb.pendingAppends.length);
		if (sb.bufferTd === undefined) {
			sb.bufferTd = document.getElementById("buffer"+sb.id);
		}
		//sb.bufferTd.textContent = rangeString;
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
		if (autoplay && sb.ms.pendingInits === 0) {
			mp4box.start();//xxxx
      downloader.resume();
		}
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
			mp4box.setSegmentOptions(track_id, sb, { nbSamples: SEGMENT_NUMBER_SAMPLES } );
			sb.pendingAppends = [];
		} catch (e) {
			Log.error("MSE - SourceBuffer #"+track_id,"Cannot create buffer with type '"+mime+"'" + e);
		}
	} else {
		Log.warn("MSE", "MIME type '"+mime+"' not supported for creation of a SourceBuffer for track id "+track_id);
		var trackType;
		var i;
		var foundTextTrack = false;
		if (codec == "wvtt" && !kind.schemeURI.startsWith("urn:gpac:")) {
			trackType = "subtitles";
		} else {
			trackType = "metadata";
		}
		for (i = 0; i < video.textTracks.length; i++) {
			var track = video.textTracks[i];
			if (track.label === 'track_'+track_id) {
				track.mode = "showing";
				track.div.style.display = 'inline';
				foundTextTrack = true;
				break;
			}
		}
		if (!foundTextTrack) {
			var texttrack = video.addTextTrack(trackType, "track_"+track_id);
			texttrack.mode = "showing";
			mp4box.setExtractionOptions(track_id, texttrack, { nbSamples: parseInt(extractionSizeLabel.value) });
			texttrack.codec = codec;
			texttrack.mime = codec.substring(codec.indexOf('.')+1);
			texttrack.mp4kind = mp4track.kind;
			texttrack.track_id = track_id;
			var div = document.createElement("div");
			div.id = "overlay_track_"+track_id;
			div.setAttribute("class", "overlay");
			overlayTracks.appendChild(div);
			texttrack.div = div;
			initTrackViewer(texttrack);
		}
	}
}


function onSourceOpen(e) {
	var ms = e.target;
	Log.info("MSE", "Source opened");
	Log.debug("MSE", ms);
	//urlSelector.disabled = false;
}

function onSourceClose(e) {
	var ms = e.target;
	if (ms.video.error) {
		Log.error("MSE", "Source closed, video error: "+ ms.video.error.code);		
	} else {
		Log.info("MSE", "Source closed, no error");
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
  initializeAllSourceBuffers(info);  
};

 

mp4box.onSegment = function (id, user, buffer, sampleNum) {	//xxxxx
		var sb = user;
		sb.segmentIndex++;
		sb.pendingAppends.push({ id: id, buffer: buffer, sampleNum: sampleNum });
		Log.info("Application","Received new segment for track "+id+" up to sample #"+sampleNum+", segments pending append: "+sb.pendingAppends.length);
		onUpdateEnd.call(sb, true, false);
};
mp4box.onSamples = function (id, user, samples) {//xxxx
		var sampleParser;
		var cue;	
		var texttrack = user;
		Log.info("TextTrack #"+id,"Received "+samples.length+" new sample(s)");
		for (var j = 0; j < samples.length; j++) {
			var sample = samples[j];
			if (sample.description.type === "wvtt") {
				sampleParser = new VTTin4Parser();
				cues = sampleParser.parseSample(sample.data);
				for (var i = 0; i < cues.length; i++) {
					var cueIn4 = cues[i];
					cue = new VTTCue(sample.dts/sample.timescale, (sample.dts+sample.duration)/sample.timescale, (cueIn4.payl ? cueIn4.payl.text : ""));
					texttrack.addCue(cue);
				}
			} else if (sample.description.type === "metx" || sample.description.type === "stpp") {
				sampleParser = new XMLSubtitlein4Parser();
				var xmlSubSample = sampleParser.parseSample(sample); 
				console.log("Parsed XML sample at time "+Log.getDurationString(sample.dts,sample.timescale)+" :", xmlSubSample.document);
				cue = new VTTCue(sample.dts/sample.timescale, (sample.dts+sample.duration)/sample.timescale, xmlSubSample.documentString);
				texttrack.addCue(cue);
				cue.is_rap = sample.is_rap;
				cue.onenter = processInbandCue;
			} else if (sample.description.type === "mett" || sample.description.type === "sbtt" || sample.description.type === "stxt") {
				sampleParser = new Textin4Parser();
				if (sample.description.txtC && j===0) {
					if (sample.description.txtC.config) {
					} else {
						sample.description.txtC.config = sampleParser.parseConfig(sample.description.txtC.data); 
					}
					console.log("Parser Configuration: ", sample.description.txtC.config);
					texttrack.config = sample.description.txtC.config;
				}
				var textSample = sampleParser.parseSample(sample); 
				console.log("Parsed text sample at time "+Log.getDurationString(sample.dts,sample.timescale)+" :", textSample);
				cue = new VTTCue(sample.dts/sample.timescale, (sample.dts+sample.duration)/sample.timescale, textSample);
				texttrack.addCue(cue);
				cue.is_rap = sample.is_rap;
				cue.onenter = processInbandCue;
			}
		}
};




 var downloader = new Downloader();
 downloader.setInterval(100);
 downloader.setChunkSize(2000000);
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
  
