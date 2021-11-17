"use strict";

////////////////////////////////////
//
//   Emulator Execution
//
////////////////////////////////////

//must be set > 0
var scaleFactor = 5;
//dom id for canvas element
var renderTarget = "target";

const optionFlags = [
	"tickrate",
	"fillColor",
	"fillColor2",
	"blendColor",
	"backgroundColor",
	"buzzColor",
	"quietColor",
	"shiftQuirks",
	"loadStoreQuirks",
	"vfOrderQuirks",
	"clipQuirks",
	"vBlankQuirks",
	"jumpQuirks",
	"screenRotation",
	"maxSize",
	"touchInputMode",
	"logicQuirks",
	"fontStyle",
]
function unpackOptions(emulator, options) {
	optionFlags.forEach(x => { if (x in options) emulator[x] = options[x] })
	if (options["enableXO"]) emulator.maxSize = 65024 // legacy option
}
function packOptions(emulator) {
	const r = {}
	optionFlags.forEach(x => r[x] = emulator[x])
	return r
}

function setRenderTarget(scale, canvas) {
	scaleFactor = scale;
	renderTarget = canvas;
	var c = document.getElementById(canvas);

	// Remove any existing previous delta frame so first frame is always drawn:
	c.last = undefined;

	var w  = scaleFactor * 128;
	var h  = scaleFactor *  64;

	if (emulator.screenRotation == 90 || emulator.screenRotation == 270) {
		c.width  = h;
		c.height = w;
	}
	else {
		c.width  = w;
		c.height = h;
	}
}

function setTransform(emulator, g) {
	g.setTransform(1, 0, 0, 1, 0, 0);
	var x = scaleFactor * 128;
	var y = scaleFactor *  64;
	switch(emulator.screenRotation) {
		case 90:
			g.rotate(0.5 * Math.PI);
			g.translate(0, -y);
			break;
		case 180:
			g.rotate(1.0 * Math.PI);
			g.translate(-x, -y);
			break;
		case 270:
			g.rotate(1.5 * Math.PI);
			g.translate(-x, 0);
			break;
		default:
			console.assert(emulator.screenRotation === 0, 'Screen rotation not set to 0, 90, 180, or 270. Treating as 0.')
	}
}


function arrayEqual(a, b) {
	var length = a.length;
	if (length !== b.length) { return false; }
	for (var i = 0; i < length; i++) {
		if (a[i] !== b[i]) { return false; }
	}
	return true;
}

function getColor(id) {
	return emulator.palettes[id];
	switch(id) {
		case 0: return emulator.backgroundColor;
		case 1: return emulator.fillColor;
		case 2: return emulator.fillColor2;
		case 3: return emulator.blendColor;
	}
	throw "invalid color: " + id;
}

function renderDisplay(emulator) {
	var c = document.getElementById(renderTarget);

	// Canvas rendering can be expensive. Exit out early if nothing has changed.
	var colors = [...emulator.palettes];
	if (c.last !== undefined ) {
		if (arrayEqual(c.last.p[0], emulator.p[0]) && arrayEqual(c.last.p[1], emulator.p[1])
				&& arrayEqual(c.last.colors, colors)) {
			return;
		}
		if (c.last.hires !== emulator.hires)
			c.last = undefined;  // full redraw when switching resolution
	}
	var g = c.getContext("2d");
	setTransform(emulator, g);
	var w      = emulator.hires ? 128         : 64;
	var h      = emulator.hires ? 64          : 32;
	var size   = emulator.hires ? scaleFactor : scaleFactor*2;
	var lastPixels = c.last !== undefined? c.last.p: [[], []];

	g.scale(size, size)
	var z = 0, p = emulator.p;
	for(var y = 0; y < h; ++y) {
		for(var x = 0; x < w; ++x, ++z) {
			var oldColorIdx = lastPixels[0][z] + (lastPixels[1][z] << 1);
			var colorIdx = p[0][z] + p[1][z]*2 + p[2][z]*4 + p[3][z]*8;
			//if (oldColorIdx !== colorIdx) {
				g.fillStyle = getColor(colorIdx);
				g.fillRect(x, y, 1, 1);
			//}
		}
	}
	g.scale(1, 1) //restore scale to 1,1 just in case

	c.last = {
		colors: colors,
		p: [emulator.p[0].slice(), emulator.p[1].slice()],
		hires: emulator.hires,
	};
}

////////////////////////////////////
//
//   Audio Playback
//
////////////////////////////////////

var audio;
var audioNode;
var audioSource;
var audioData;
var XOAudio;

var AudioBuffer = function(buffer, duration) {
	if (!(this instanceof AudioBuffer)) {
		return new AudioBuffer(buffer, duration);
	}

	this.pointer = 0;
	this.buffer = buffer;
	this.duration = duration;
}

AudioBuffer.prototype.write = function(buffer, index, size) {
	size = Math.max(0, Math.min(size, this.duration))
	if (!size) { return size; }

	this.duration -= size;
	var bufferSize = this.buffer[0].length;
	var end = index + size;

	for(var i = index; i < end; ++i) {
		buffer[0][i] = this.buffer[0][this.pointer];
		buffer[1][i] = this.buffer[1][this.pointer];
		this.pointer = (this.pointer+1)%bufferSize;
	}

	return size;
}

AudioBuffer.prototype.dequeue = function(duration) {
	this.duration -= duration;
}

AudioBuffer.prototype.mix = function(audioBuffer){
	var buf = audioBuffer.buffer;
	var len = Math.min(this.buffer[0].length,buf[0].length);
	for(var i = 0; i < len; i++){
		this.buffer[0][i] += buf[0][i];
		this.buffer[1][i] += buf[1][i];
	}
}

var FREQ = 4000;
var PITCH_BIAS = 64;

function audioEnable() {
	// this will only work if called directly from a user-generated input handler:
	if (audio && audio.state == 'suspended') audio.resume()
}

function audioSetup(emulator) {
	if (!audio) {
		if (typeof AudioContext !== 'undefined') {
			audio = new AudioContext();
		}
		else if (typeof webkitAudioContext !== 'undefined') {
			audio = new webkitAudioContext();
		}
	}
	audioEnable()
	if (audio && !audioNode) {
		const bufferSize = // set bufferSize according to environment's samplerate
		audio.sampleRate <  64000 ? 2048 : // for 48000hz or 44100hz or less
		audio.sampleRate < 128000 ? 4096 : 8192; // for 96000hz or more
		audioNode = audio.createScriptProcessor(bufferSize, 0, 2);
		audioNode.gain = audio.createGain();
		audioNode.gain.gain.value = VOLUME ;
		audioNode.onaudioprocess = function(audioProcessingEvent) {
			var outputBuffer = audioProcessingEvent.outputBuffer;
			var outputData = [
				outputBuffer.getChannelData(0),
				outputBuffer.getChannelData(1)]
			var samples_n = outputBuffer.length;
			var index = 0;
			while(audioData.length && index < samples_n) {
				var size = samples_n - index;
				var written = audioData[0].write(outputData, index, size);
				index += written;
				if (written < size) {
					audioData.shift();
				}
			}

			while(index < samples_n) {
				outputData[0][index++] = 0;
				outputData[1][index++] = 0;
			}
			//the last one can be long sound with high value of buzzer, so always keep it
			if (audioData.length > 1) {
				var audioDataSize = 0;
				var audioBufferSize = audioNode.bufferSize;
				audioData.forEach(function(buffer) { audioDataSize += buffer.duration; })
				while(audioDataSize > audioBufferSize && audioData.length > 1) {
					audioDataSize -= audioData.shift().duration;
				}
			}
		}
		audioData = [];
		audioNode.connect(audioNode.gain);
		audioNode.gain.connect(audio.destination);

		XOAudio = new AudioControl();
		emulator.buzzTimer  = _ => XOAudio.setTimer(_);
		emulator.buzzBuffer = _ => XOAudio.setBuffer(_);
		emulator.buzzPitch  = _ => XOAudio.setPitch(_);
		emulator.buzzVolume = _ => XOAudio.setVolume(_);
		emulator.buzzSelect = _ => XOAudio.setSelect(_);
		emulator.buzzChannel= _ => XOAudio.setChannel(_);
	}
	return audio && audioNode
}

function stopAudio() {
	if (!audio) { return; }
	if (audioNode) {
		audioNode.disconnect();
		audioNode = null;
	}
	audioData = [];
}

var VOLUME = 0.25;

function playPattern(soundLength,buffer,pitch=PITCH_BIAS,
	sampleState=[[0,0,0],[0,0,0]],gains=[1,1]) {
	if (!audio) { return; }
	audioEnable()

	var freq = FREQ*2**((pitch-PITCH_BIAS)/48);
	var samples = Math.ceil(audio.sampleRate * soundLength);
	
	if(buffer.length==0) buffer = [0]
	var bufflen = buffer.length * 8;
	var audioBuffer = [
		new Float32Array(samples),
		new Float32Array(samples)];

	var step = freq / audio.sampleRate;

	// keep super-sampling consistent with audio sample rate
	var quality = Math.ceil( 384000 / audio.sampleRate );

	var lowpass = 4 // compact second-order low-pass filter preset.
	// the current preset is only intended to smooth out supersamples
	// to decimate, not filtering audible trebles. Though the below code
	// could be uncommented to demonstrate lowpass filtered output:
	// var lowpass = 16 // Higher the value, stronger the lowpass.
	
	var newSampleState = [];
	for(var channel = 0; channel < 2; channel++){
		// retrieve current sample states
		var pos = Math.fround(sampleState[channel][0]); // sample position
		var val = Math.fround(sampleState[channel][1]); // first term
		var vel = Math.fround(sampleState[channel][2]); // second term
		var gain = gains[channel];
		
		for(var i = 0, il = samples; i < il; i++) {
			for (var j = 0; j < quality; ++j) {
				var cell = pos >> 3, shift = pos & 7 ^ 7;
				var sample = buffer[cell] >> shift & 1;
				vel += sample*gain - val - vel / lowpass;
				val += vel / lowpass / lowpass;
				pos = ( pos + step / quality ) % bufflen;
			}
			audioBuffer[channel][i] = val;
		}
		newSampleState.push([pos,val,vel]);
	}

	audioData.push(new AudioBuffer(audioBuffer, samples));
	
	return newSampleState;
}

function AudioControl(){
	function Voice(){
		this.sample = [[0,0,0],[0,0,0]];
		this.buffer = [0];
		this.reset = true;
		this.timer = 0;
		this.pitch = PITCH_BIAS;
		this.volume = 1;
		this.left = true;
		this.right = true;
	}
	
	this.voices = [new Voice(),new Voice(),new Voice(),new Voice()];
	this.voice = this.voices[0];
	var emptyVoice = new Voice();

	this.refresh = _ => {
		playPattern(_,[0]);
		let lastBuffer = audioData.pop();
		for (var i = 0 ; i < this.voices.length; i++) {
			var voice = this.voices[i];
			if (voice.reset) voice.sample.pos = 0; voice.reset = false;
			var chGain = voice.timer?[voice.volume*voice.left,voice.volume*voice.right]:[0,0];
			voice.sample = playPattern(_,voice.buffer,voice.pitch,voice.sample,chGain);
			if(!(voice.timer -= voice.timer > 0)) voice.reset = true;
			lastBuffer.mix(audioData.pop());
		}
		audioData.push(lastBuffer);
		while(audioData.length > 8) audioData.shift();
	}
	this.setTimer = (timer) => {
		if(timer == 0) this.voice.reset = true;
		this.voice.timer = timer;
	}
	this.setBuffer = buffer => this.voice.buffer = buffer;
	this.setPitch = pitch => this.voice.pitch = pitch;
	this.setVolume = volume => this.voice.volume = volume/255;
	this.setChannel = mask => {
		this.voice.left=(mask&1)!=0;
		this.voice.right=(mask&2)!=0;
	}
	this.setSelect = select => {
		if(select>3) this.voice= emptyVoice;
		else this.voice=this.voices[select];
	}
	
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
