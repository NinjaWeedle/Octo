/**
*
* Recording animated GIFs
*
**/

function paletteToRGB(pal) {
	// convert CSS colors into packed RGB colors
	const g = document.createElement('canvas').getContext('2d')
	pal.forEach((x,i) => { g.fillStyle = x; g.fillRect(i, 0, 1, 1) })
	const d = g.getImageData(0, 0, pal.length, 1)
	return pal.map((_,i) => (d.data[i*4]<<16) | (d.data[i*4+1]<<8) | (d.data[i*4+2]))
}

const runRecord = document.getElementById('run-record')
var currentRecording = null
var heldFrame = null
var heldTicks = 1

function recordFrame() {
	if (currentRecording == null) return

	if (renderTarget.eq)
		heldTicks++
	else {
		currentRecording.frame(
			heldFrame, 
			heldTicks * 2,
			renderTarget.col
		)
		heldTicks = 1
	}
}

runRecord.onclick = _ => {
	if (currentRecording == null) {
		runRecord.src = 'images/recording.png'
		currentRecording = gifBuilder(128, 64, renderTarget.col)
		currentRecording.comment('made with octo on ' + new Date().toISOString())
		currentRecording.loop()
		heldFrame = renderTarget.last;
		heldTicks = 1
	}
	else {
		if (heldFrame != null) currentRecording.frame(heldFrame, heldTicks * 2)
		saveGif('recording.gif',currentRecording.finish())
		runRecord.src = 'images/record.png'
		currentRecording = null
	}
}
