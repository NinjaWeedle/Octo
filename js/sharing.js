/**
* Sharing/Loading externally-hosted programs
**/

const placeholderProgram = `# Chip8 is a virtual machine designed in 1977 for programming video games.
# Octo is a high level assembler, disassembler and simulator for Chip8.
# Click 'Run' and then press ASWD to move the sprite around the screen.
# Click the Octo logo for source, documentation and examples.

:alias px v1
:alias py v2

: main
  px := random 0b0011111
  py := random 0b0001111
  i  := person
  sprite px py 8

  loop
    # erase the player, update its position and then redraw:
    sprite px py 8
    v0 := OCTO_KEY_W if v0 key then py += -1
    v0 := OCTO_KEY_S if v0 key then py +=  1
    v0 := OCTO_KEY_A if v0 key then px += -1
    v0 := OCTO_KEY_D if v0 key then px +=  1
    sprite px py 8

    # lock the framerate of this program via the delay timer:
    loop
      vf := delay
      if vf != 0 then
    again
    vf := 3
    delay := vf
  again

: person
  0x70 0x70 0x20 0x70 0xA8 0x20 0x50 0x50`

/**
* Implementation
**/

var lastLoadedKey = null
const sharingBaseUrl = 'https://vectorland.nfshost.com/storage/octo/'

function share() {
	ajax('POST', sharingBaseUrl, preparePayload(), (r, s) => {
		if (r.error) { setStatusMessage(r.error, false); return }
		var l = window.location.href.replace(/(index\.html|\?key=.*)*$/, 'index.html?key=' + r.key)
		window.location.href = l
	})
}

function preparePayload() {
	return {
		key:     lastLoadedKey,
		created: new Date().toISOString(),
		program: editor.getValue(),
		options: packOptions(emulator),
	}
}
function applyPayload(options, program) {
	editor.setValue(program)
	speedMenu.setValue(options.tickrate)
	unpackOptions(emulator, options)
	updateSpriteEditor()
	updateAudio()
	updateColor()
	updateOptions()
}
function openPayload(options, program) {
	applyPayload(options, program)
	saveLocalOptions()
	saveLocalProgram()
}
function runPayload(options, program) {
	applyPayload(options, program)
	document.getElementById('main-run').click()
}
function runShared(key) {
	ajax('GET', sharingBaseUrl + key, null, (result, s) => {
		lastLoadedKey = key
		runPayload(result.options, result.program)
	})
}
function runGist(id) {
	ajax('GET', 'https://api.github.com/gists/' + id, null, (result, s) => {
		runPayload(JSON.parse(result.files['options.json'].content), result.files['prog.ch8'].content)
	})
}

function saveLocalOptions() { setPref('octoOptions',packOptions(emulator)) }
function saveLocalProgram() { setPref('octoProgram',editor.getValue()) }

function loadExamples() {
	ajax('GET', 'https://api.github.com/repos/JohnEarnest/Octo/contents/examples', null, result => {
		const target = document.querySelector('#main-examples ul')
		target.innerHTML = ''
		result.filter(x => x.type == 'file').forEach(x => {
			var r = document.createElement('li')
			r.innerHTML = x.name
			r.onclick = _ => ajax('GET', x.url, null, result => {
				editor.setValue(window.atob(result.content.replace(/(?:\r\n|\r|\n)/g, '')))
				setStatusMessage('loaded example program <tt>'+x.name+'</tt>', true)
			})
			target.appendChild(r)
		})
	})

	// load a shared program, if specified
	const key = location.search.match(/key=([a-zA-Z0-9-_]+)/)
	if (key) { runShared(key[1]); return }
	const gistId = location.search.match(/gist=(\w+)/)
	if (gistId) { runGist(gistId[1]); return }

	// restore the local data, if available
	try {
		const options = getPref('octoOptions')
		const program = getPref('octoProgram')
		if (options) unpackOptions(emulator, options)
		if (program && program.trim().length) {
			editor.setValue(program)
			setStatusMessage('Restored local working copy.', true)
			return
		}
	}
	catch (error) {
		console.log('restoring workspace failed!')
		console.log(error)
	}

	// fall back to the demo program
	editor.setValue(placeholderProgram)
}

/**
* Standalone
*
* Some services like Itch.io allow hosting a game as a standalone HTML file.
* This routine glues together the necessary parts of the Octo emulator/compiler,
* the program data, and a small runtime stub.
**/

const MAGIC_STRING = '<!-- Standalone Generated By Octo (octo-ide.com) -->\n'

function buildStandalone(callback, options) {
	console.log('build standalone...')
	let c = new Compiler(editor.getValue())
	let o = packOptions(emulator)
	o.touchInputMode = options.inputMode
	o.displayScale   = options.scale
	let page = MAGIC_STRING + `<script>data=${JSON.stringify({
		program: editor.getValue(),
		options: o,
		rom:     (c.go(),c.rom),
	})}</script>\n`
	if (options.staticKeymap) {
		page += `<script>STATIC_KEYMAP=${JSON.stringify(keymap)}</script>\n`
	}
	let i = 0
	const root = 'https://johnearnest.github.io/Octo/'
	const deps = [
		{u:root+'js/emulator.js', f:x=>`<script>${x}</script>\n`},
		{u:root+'js/shared.js',   f:x=>`<script>${x}</script>\n`},
		{u:root+'js/input.js',    f:x=>`<script>${x}</script>\n`},
		{u:root+'standalone.html',f:x=>x},
	]
	function fetchDeps() {
		const x = new XMLHttpRequest()
		x.open('GET', deps[i].u)
		x.onreadystatechange = _ => {
			if (x.readyState != 4) return
			if (x.status != 200) {
				console.log('Unable to retrieve ' + deps[i].u, x.status)
				return
			}
			console.log('successfully fetched ', deps[i].u, x.responseText.length)
			page += deps[i++].f(x.responseText)
			if (i >= deps.length) { callback(page) }
			else { fetchDeps() }
		}
		x.send()
	}
	fetchDeps()
}

function parseStandalone(text) {
	if (text.indexOf(MAGIC_STRING) != 0) { throw 'does not appear to be a standalone file.' }
	var payload = text.slice(0, text.indexOf('</script>'))
	return JSON.parse(payload.slice(payload.indexOf('=')+1))
}

/**
* Cartridges
*
* Octo cartridge files are GIF89a images with a payload steganographically
* embedded in one or more animation frames. Data is stored in the least significant
* bits of colors, 1 from the red/blue channels and 2 from the green channel,
* allowing us to pack a hidden byte into every 2 successive pixels.
*
* The payload consists of a 32-bit length, followed by a sequence of ASCII bytes
* consisting of the JSON-encoded options dictionary and source text.
**/

const LABEL_FONT = [ // 8x5 pixels, A-Z0-9.-
	0x3F, 0x50, 0x90, 0x50, 0x3F, 0x00, 0xFF, 0x91, 0x91, 0x91, 0x6E, 0x00, 0x7E, 0x81, 0x81,
	0x81, 0x42, 0x00, 0xFF, 0x81, 0x81, 0x81, 0x7E, 0x00, 0xFF, 0x91, 0x91, 0x81, 0x81, 0x00,
	0xFF, 0x90, 0x90, 0x80, 0x80, 0x00, 0x7E, 0x81, 0x91, 0x91, 0x9E, 0x00, 0xFF, 0x10, 0x10,
	0x10, 0xFF, 0x00, 0x81, 0x81, 0xFF, 0x81, 0x81, 0x00, 0x02, 0x81, 0x81, 0xFE, 0x80, 0x00,
	0xFF, 0x10, 0x20, 0x50, 0x8F, 0x00, 0xFF, 0x01, 0x01, 0x01, 0x01, 0x00, 0xFF, 0x40, 0x20,
	0x40, 0xFF, 0x00, 0xFF, 0x40, 0x20, 0x10, 0xFF, 0x00, 0x7E, 0x81, 0x81, 0x81, 0x7E, 0x00,
	0xFF, 0x90, 0x90, 0x90, 0x60, 0x00, 0x7E, 0x81, 0x85, 0x82, 0x7D, 0x00, 0xFF, 0x90, 0x90,
	0x98, 0x67, 0x00, 0x62, 0x91, 0x91, 0x91, 0x4E, 0x00, 0x80, 0x80, 0xFF, 0x80, 0x80, 0x00,
	0xFE, 0x01, 0x01, 0x01, 0xFE, 0x00, 0xFC, 0x02, 0x01, 0x02, 0xFC, 0x00, 0xFF, 0x02, 0x04,
	0x02, 0xFF, 0x00, 0xC7, 0x28, 0x10, 0x28, 0xC7, 0x00, 0xC0, 0x20, 0x1F, 0x20, 0xC0, 0x00,
	0x87, 0x89, 0x91, 0xA1, 0xC1, 0x00, 0x7E, 0x81, 0x99, 0x81, 0x7E, 0x00, 0x21, 0x41, 0xFF,
	0x01, 0x01, 0x00, 0x43, 0x85, 0x89, 0x91, 0x61, 0x00, 0x82, 0x81, 0xA1, 0xD1, 0x8E, 0x00,
	0xF0, 0x10, 0x10, 0xFF, 0x10, 0x00, 0xF2, 0x91, 0x91, 0x91, 0x9E, 0x00, 0x7E, 0x91, 0x91,
	0x91, 0x4E, 0x00, 0x80, 0x90, 0x9F, 0xB0, 0xD0, 0x00, 0x6E, 0x91, 0x91, 0x91, 0x6E, 0x00,
	0x62, 0x91, 0x91, 0x91, 0x7E, 0x00, 0x00, 0x00, 0x06, 0x06, 0x00, 0x00, 0x00, 0x10, 0x10,
	0x10, 0x10, 0x00,
]
const BASE_IMAGE = [
	0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0xA0, 0x00, 0x80, 0x00, 0xA2, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x80, 0x66, 0x50, 0xBF, 0xBE, 0xA6, 0xF6, 0xE3, 0x9F, 0xF6, 0xEA, 0xCF, 0xFF, 0xFF,
	0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x09, 0x00, 0x00, 0x06, 0x00,
	0x2C, 0x00, 0x00, 0x00, 0x00, 0xA0, 0x00, 0x80, 0x00, 0x00, 0x03, 0xFF, 0x08, 0x1A, 0xDC,
	0xFE, 0x30, 0xCA, 0x49, 0xAB, 0xBD, 0x38, 0x6B, 0xAC, 0xBA, 0x0F, 0x42, 0x28, 0x8E, 0x64,
	0x69, 0x9E, 0x68, 0xAA, 0xAE, 0x6C, 0xEB, 0xBE, 0x6D, 0xE0, 0x75, 0xA0, 0xD0, 0x91, 0xB7,
	0x3D, 0x87, 0xF9, 0xEC, 0xFF, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x8F, 0xC4, 0x90, 0xEC,
	0xC3, 0x6B, 0x00, 0x44, 0x00, 0xA7, 0x00, 0x62, 0x93, 0xC2, 0xAE, 0xD8, 0xAC, 0x76, 0x7B,
	0x5A, 0x2E, 0xAA, 0x20, 0xC6, 0x33, 0x1A, 0xAE, 0x4D, 0x6B, 0xE4, 0xF3, 0x18, 0xC9, 0x6E,
	0xBB, 0xDF, 0xF0, 0xA1, 0x92, 0x76, 0x16, 0x31, 0xEA, 0xA5, 0x3B, 0x7E, 0xCF, 0xED, 0xFB,
	0xFF, 0x7F, 0x4B, 0x65, 0x63, 0x77, 0x62, 0x3A, 0x76, 0x35, 0x86, 0x69, 0x71, 0x8C, 0x8D,
	0x8E, 0x8F, 0x3B, 0x53, 0x51, 0x4A, 0x32, 0x7A, 0x6A, 0x96, 0x98, 0x95, 0x66, 0x80, 0x9C,
	0x9D, 0x9E, 0x2C, 0x99, 0x9B, 0x67, 0x9B, 0x96, 0xA3, 0x3C, 0x90, 0xA8, 0xA9, 0xAA, 0x45,
	0x7C, 0x9F, 0xAE, 0xAF, 0xB0, 0x7D, 0xA5, 0xB1, 0xB4, 0xB5, 0xB6, 0x5D, 0xA2, 0xB7, 0xBA,
	0xBB, 0xAF, 0xB3, 0xBC, 0xBF, 0xC0, 0xB2, 0xB9, 0xC1, 0xC4, 0xC5, 0x31, 0xC3, 0xC6, 0xC9,
	0xCA, 0x23, 0xBE, 0xCB, 0xCE, 0xC9, 0xCD, 0xAB, 0xD2, 0xD3, 0xD4, 0x46, 0x26, 0xBE, 0x64,
	0x1B, 0xDA, 0xDB, 0xDC, 0xDD, 0xDE, 0xDF, 0x86, 0x24, 0xBE, 0xE0, 0xE4, 0xE5, 0xE6, 0xE7,
	0x1A, 0x79, 0xB9, 0x0F, 0x03, 0xED, 0xEE, 0x03, 0x0C, 0xEF, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6,
	0xF7, 0xF8, 0xF9, 0xFA, 0xFB, 0xEE, 0x04, 0xFE, 0xFC, 0xF4, 0x1E, 0xA8, 0x53, 0x17, 0xAF,
	0x5E, 0x00, 0x80, 0x08, 0x13, 0x2A, 0x5C, 0x98, 0xCF, 0xDF, 0x3F, 0x86, 0x0E, 0x06, 0x8A,
	0x2B, 0xC8, 0xB0, 0xA2, 0xC5, 0x8B, 0x0C, 0x1D, 0x3E, 0x5C, 0xD8, 0x40, 0xFF, 0x22, 0xB3,
	0x83, 0x18, 0x43, 0x8A, 0x1C, 0x59, 0x4F, 0xA3, 0xC5, 0x71, 0xEB, 0x40, 0x92, 0x5C, 0xC9,
	0xF2, 0xA2, 0xC3, 0x93, 0x29, 0xD5, 0xB5, 0x9C, 0x49, 0x33, 0xE1, 0x4B, 0x88, 0x31, 0x27,
	0xD6, 0xDC, 0xC9, 0xF3, 0xDE, 0x4D, 0x85, 0x28, 0x65, 0xF6, 0x1C, 0x4A, 0x74, 0xC0, 0x4F,
	0x84, 0x41, 0x75, 0x16, 0x5D, 0xCA, 0xF3, 0xE8, 0xBE, 0xA4, 0x1F, 0x99, 0x4A, 0x9D, 0x5A,
	0x92, 0x00, 0x54, 0x44, 0x54, 0xB3, 0x36, 0xD5, 0xB8, 0xD1, 0xDF, 0x55, 0x4A, 0x5A, 0xC3,
	0xB6, 0xE4, 0xEA, 0xF4, 0xEB, 0x19, 0xB1, 0x68, 0x57, 0x9A, 0x9C, 0x67, 0x96, 0x62, 0xDA,
	0xB7, 0x34, 0xDB, 0xAA, 0x84, 0x4B, 0x77, 0xA5, 0xDC, 0xBA, 0x78, 0x49, 0xDE, 0xCD, 0xCB,
	0xF7, 0xE2, 0xDE, 0xBE, 0x80, 0x81, 0xE6, 0x8C, 0x1A, 0xB8, 0x30, 0xC0, 0xBF, 0x86, 0x13,
	0xDF, 0x43, 0xAC, 0xB8, 0xB1, 0x3C, 0xC6, 0x8E, 0x23, 0x43, 0x8E, 0xDC, 0x78, 0x32, 0xE5,
	0xC4, 0x96, 0x2F, 0x17, 0xCE, 0xAC, 0x19, 0x30, 0xE7, 0xCE, 0x7C, 0x3F, 0x83, 0xC6, 0x2B,
	0x7A, 0x34, 0xDD, 0xD2, 0xA6, 0xDF, 0xA2, 0x4E, 0x8D, 0x76, 0x35, 0xEB, 0xB0, 0xAE, 0x5F,
	0x67, 0x8D, 0x2D, 0x7B, 0x2A, 0xED, 0xDA, 0x4C, 0x6F, 0xE3, 0x2E, 0xAA, 0x7B, 0xF7, 0xD0,
	0xDE, 0xBE, 0x79, 0x02, 0x0F, 0x5E, 0x73, 0x38, 0xF1, 0x99, 0xC6, 0x8F, 0xB3, 0x4C, 0xAE,
	0x5C, 0xEF, 0x60, 0xAC, 0xCD, 0xD3, 0x32, 0x8F, 0x1E, 0x72, 0x3A, 0x75, 0xBF, 0xCF, 0xC1,
	0x5E, 0x87, 0x9D, 0xFD, 0xEC, 0x76, 0xAD, 0xD6, 0xBF, 0x73, 0xEC, 0xEE, 0x56, 0x7C, 0x6E,
	0xF2, 0x73, 0xCD, 0x2F, 0x0D, 0xAF, 0xFE, 0x30, 0xFA, 0xF6, 0x52, 0xD9, 0xC3, 0xD7, 0x27,
	0x7F, 0x3E, 0xBE, 0xFA, 0xF6, 0xED, 0xE1, 0xCF, 0x1F, 0xF0, 0x3D, 0xFF, 0x9E, 0xFF, 0xFB,
	0xFD, 0xF7, 0x4E, 0x80, 0x02, 0xB6, 0x43, 0x60, 0x81, 0x8C, 0xAD, 0x55, 0x20, 0x46, 0x09,
	0x3A, 0xB5, 0x20, 0x4E, 0x1E, 0x41, 0xD7, 0x8F, 0x83, 0x0F, 0x0A, 0x16, 0xA1, 0x76, 0xEF,
	0x10, 0x50, 0x61, 0x75, 0xFE, 0xD9, 0xB3, 0xD1, 0x86, 0xEE, 0x5D, 0xE8, 0x9D, 0x87, 0x1A,
	0x82, 0x88, 0x14, 0x7A, 0xE9, 0x35, 0x97, 0xE2, 0x6F, 0x72, 0x95, 0x77, 0x9C, 0x8B, 0x00,
	0x76, 0x34, 0x11, 0x41, 0xE5, 0xAD, 0x68, 0x9A, 0x03, 0xE7, 0xC9, 0xF8, 0x11, 0x8D, 0xE8,
	0xF4, 0xE8, 0xE3, 0x8F, 0xDC, 0x88, 0x38, 0x0A, 0x90, 0x44, 0x16, 0x69, 0xA4, 0x8E, 0x3B,
	0x3E, 0xA3, 0xA4, 0x32, 0xCD, 0x2C, 0xE9, 0xA4, 0x2E, 0x4D, 0x3E, 0x29, 0x65, 0x2C, 0x51,
	0x4E, 0x69, 0xA5, 0x27, 0x55, 0x5E, 0xA9, 0xA5, 0x1F, 0x59, 0x6E, 0xE9, 0x65, 0x16, 0x5D,
	0x7E, 0x29, 0xA6, 0x0B, 0x61, 0x8E, 0x69, 0x66, 0x0A, 0x65, 0x9E, 0xA9, 0xE6, 0x8C, 0x6B,
	0xB6, 0x79, 0x8C, 0x9B, 0x70, 0xAA, 0x90, 0x66, 0x9C, 0x66, 0xCE, 0x49, 0xA7, 0x98, 0x76,
	0xDE, 0xE9, 0x65, 0x9E, 0x7A, 0x6A, 0xC9, 0x67, 0x9F, 0x56, 0xFE, 0x09, 0xA8, 0x94, 0x82,
	0x0E, 0xEA, 0x64, 0xA1, 0x86, 0x2A, 0x89, 0x68, 0xA2, 0xCE, 0x2C, 0xCA, 0x28, 0x93, 0xC8,
	0x3C, 0xFA, 0xA5, 0xA3, 0x92, 0x16, 0x43, 0x69, 0xA5, 0xC1, 0x5C, 0x8A, 0xE9, 0x2F, 0x9A,
	0x6E, 0xBA, 0x4B, 0xA7, 0x9E, 0xDE, 0x02, 0x6A, 0xA8, 0xB5, 0x8C, 0x4A, 0x2A, 0x95, 0x91,
	0x9E, 0x7A, 0x68, 0xAA, 0x7B, 0x4E, 0x00, 0xA7, 0xA9, 0xBB, 0x3C, 0x81, 0x82, 0xAC, 0x6B,
	0xC2, 0x1A, 0x2B, 0xAD, 0x50, 0xE0, 0xAA, 0xA6, 0xAD, 0xBC, 0x28, 0x70, 0x0A, 0x9D, 0xBC,
	0xFE, 0xE2, 0xEB, 0x9D, 0x4B, 0xA8, 0xAA, 0x65, 0x24, 0xC6, 0x3E, 0x59, 0xCD, 0xB2, 0x05,
	0xCC, 0x36, 0xCB, 0x46, 0x02, 0x00, 0x3B, 
]

/**
* For the sake of simplicity, this does not perform ANY LZW compression
* or windowing, but does squash together identical sequential frames:
**/

function gifBuilder(width, height, colors) {
	const buffer = []
	const b = x => buffer.push(x & 0xFF)
	const s = x => { b(x); b(x >> 8) }
	const t = x => x.split('').forEach(x => b(x.charCodeAt(0)))
	const z = Math.ceil(Math.log(colors.length)/Math.log(2))

	t('GIF89a') // header
	s(width)
	s(height)
	b(0xF0 | (z-1)) // global colortable, 8-bits per channel, 2^z colors
	b(0)            // background color index
	b(0)            // 1:1 pixel aspect ratio
	for (let x=0; x<1<<z; x++) { const c=colors[x]|0; b(c>>16); b(c>>8); b(c) }

	return {
		comment: text => {
			s(0xFE21)      // comment extension block
			b(text.length) // payload size
			t(text)        // payload
			b(0)           // terminator
		},
		loop: count => {
			s(0xFF21)      // application extension block
			b(11)          // name/version size
			t('NETSCAPE2.0')
			b(3)           // payload size
			b(1)           // data sub-block index
			s(count)       // repeat count (0 is forever)
			b(0)           // terminator
		},
		frame: (pixels,delay,colors=null) => {
			s(0xF921)      // graphic control extension
			b(4)           // payload size
			b(4)           // do not dispose frame
			s(delay)       // n/100 seconds
			b(0)           // no transparent color
			b(0)           // terminator

			b(0x2C)        // image descriptor
			s(0)           // x offset
			s(0)           // y offset
			s(width)
			s(height)
			if(colors){    // with local colortable
				b(0xA0 | (z-1))
				for (let x=0; x<1<<z; x++) { const c=colors[x]|0; b(c>>16); b(c>>8); b(c) }
			}   
			else b(0)      // no local colortable
			b(7)           // minimum LZW code size
			for (let off = 0; off < pixels.length; off += 64) {
				b(1 + Math.min(64,pixels.length)) // block size
				b(0x80)                           // CLEAR
				pixels.slice(off, off+64).forEach(b)
			}
			b(0) // end of frame
		},
		finish: _ => { b(0x3B); return buffer },
	}
}

function unLZW(minCodeSize, bytes) {
	const prefix=[], suffix=[], clear=1<<minCodeSize
	let   size, mask, next, old, first, i=0, b=0, d=0
	for (var x=0; x<clear; x++) suffix[x]=x

	const symbol = _ => {
		while (b<size) d+=bytes[i++]<<b, b+=8
		const r=d&mask; return d>>=size, b-=size, r
	}
	const cleartable = _ => {
		size=minCodeSize+1, mask=(1<<size)-1, next=clear+2, old=null
	}
	const unpack = (c,r) => {
		const t=[]
		if    (c==next) t.push(first),     c=old
		while (c>clear) t.push(suffix[c]), c=prefix[c]
		r.push(first=suffix[c])
		Array.prototype.push.apply(r, t.reverse())
		if (next>=4096) return
		prefix[next]=old, suffix[next++]=first
		if ((next&mask)==0 && next<4096) size++, mask+=next
	}
	cleartable()
	const r=[]
	while (i<bytes.length) {
		const t=symbol()
		if (t>next || t==clear+1) break
		else if (t==clear)  cleartable()
		else if (old==null) r.push(suffix[old=first=t])
		else                unpack(t, r), old=t
	}
	return r
}

function gifDecode(bytes) {
	if (bytes[0]!=71||bytes[1]!=73||bytes[2]!=70) throw 'bad magic number.'
	let   i  = 6 // skip GIF89a
	const b  = _ => bytes[i++] || 0
	const s  = _ => b() | (b()<<8)
	const l  = x => { const r=[]; for(let y=0;y<x;y++)r.push(b()); return r }
	const cl = x => { const r=[]; for(let y=0;y<x;y++)r.push((b()<<16)|(b()<<8)|b()); return r }
	const dl = x => { let r=[]; while(1) { const s=b(); if (!s) break; r=r.concat(l(s)); } return r }

	const width  = s()
	const height = s()
	const packed = b()
	s() // background color index, pixel aspect ratio
	const gct = (packed & 0x80) ? cl(1 << ((packed & 0x07)+1)) : null
	const frames = []

	while (i < bytes.length) {
		const here = b()
		if (here == 0x3B) break
		else if (here == 0x2C) {
			const left = s(), top = s(), iw = s(), ih = s(), ip = b()
			const lct = (ip & 0x80) ? cl(1 << ((ip & 0x7)+1)) : null
			if (ip & 0x40) throw 'interlaced GIFs are not supported.'
			let pix = unLZW(b(), dl())
			if (iw != width || ih != height || left!=0 || top!= 0) {
				const lf = frames[frames.length-1].pixels.slice(0)
				pix = copyImage(lf,width,height,pix,iw,ih,left,top)
			}
			frames.push({ palette: lct||gct, pixels:pix })
		}
		else if (here == 0x21) {
			const xt = b()
			if (xt in { 0x01:1, 0xF9:1, 0xFE:1, 0xFF:1 }) { dl() } // text, gce, comment, app
			else { throw 'unrecognized extension type '+xt+'!' }
		}
		else { throw 'unrecognized block type '+here+' at '+i }
	}
	return { width, height, frames }
}

function adaptPalette(pixels, srcpal, dstpal) {
	const m = srcpal.map(x => {
		const xr = (x>>16)&0xFF, xg = (x>>8)&0xFF, xb = (x>>8)&0xFF
		return dstpal.map(c => {
			const cr = (c>>16)&0xFF, cg = (c>>8)&0xFF, cb = (c>>8)&0xFF
			return (xr-cr)**2 + (xg-cg)**2 + (xb-cb)**2
		}).reduce((b,v,i,a) => v>a[b]?b:i, 0)
	})
	return pixels.map(x => m[x])
}

function copyImage(dest, dw, dh, src, sw, sh, x, y) {
	for (var a = 0; a < sh; a++) {
		for (var b = 0; b < sw; b++) {
			if (a+y >= 0 && a+y < dh && b+x >= 0 && b+x < dw) {
				dest[(b+x) + (dw*(a+y))] = src[b + sw*a] + 1
			}
		}
	}
	return dest
}

function printLabel(dest, pen, text) {
	const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'
	let cursorx = 16, cursory = 32
	text.toUpperCase().replace(/[^A-Z0-9-.\n ]/g, '.').split('').forEach(c => {
		if (c == ' ') {
			cursorx += 6
		}
		else if (c == '\n') {
			cursorx = 16
			cursory += 9
		}
		else {
			const i = alpha.indexOf(c)
			for (let x = 0; x < 6; x++) {
				for (let y = 0; y < 8; y++) {
					if ((x + cursorx > dest.w - 16) ||
						(y + cursory > dest.h)) continue
					if (Math.random() > .95) continue
					const color = (LABEL_FONT[(i * 6) + x] >> (7-y)) & 1
					if (!color) continue
					dest.buffer[(x + cursorx) + dest.w*(y + cursory)] = pen
				}
			}
			cursorx += 6
		}
		cursorx += Math.random() > .8 ? 1 : 0
		cursory += Math.random() > .8 ? 1 : 0
	})
}

function decorateCartridge(label, image) {
	const base = gifDecode(BASE_IMAGE)
	if (image) {
		const p = base.frames[0].palette;
		copyImage(
			base.frames[0].pixels, base.width, base.height,
			adaptPalette(image.frames[0].pixels, image.frames[0].palette, [NaN,p[1],p[3],p[4]]),
			image.width, image.height, 16, 21,
		)
	}
	else {
		const p = { w: base.width, h: base.height, buffer: new Uint8Array(base.frames[0].pixels) }
		printLabel(p, 1, label)
		base.frames[0].pixels = p.buffer
	}
	return base
}

function buildCartridge(label, data, image) {
	const base = decorateCartridge(label, image && gifDecode(image))
	const bytes = JSON.stringify(data).split('').map(x => x.charCodeAt(0))
	const payload = [
		(bytes.length >> 24) & 0xFF,
		(bytes.length >> 16) & 0xFF,
		(bytes.length >>  8) & 0xFF,
		(bytes.length      ) & 0xFF,
	].concat(bytes)
	const w = base.width
	const h = base.height
	const PER_FRAME = (w * h) / 2
	const expand = colors => {
		const r = []
		colors.forEach(c => {
			for (let x=0; x<16; x++) r.push((c&0xFEFCFE) | ((x&0x8)<<13) | ((x&0x6)<<7) | (x&1))
		})
		return r
	}
	const encode = (buffer, data) => {
		if (data.length > buffer.length/2) throw 'data overflow!'
		return buffer.map((x, i) => (x*16) + (((data[Math.floor(i/2)]||0) >> (i%2==0?4:0)) & 0xF))
	}
	const g = gifBuilder(w, h, expand(base.frames[0].palette))
	for (let x = 0; x < payload.length; x += PER_FRAME) {
		g.frame(encode(base.frames[0].pixels, payload.slice(x, x+PER_FRAME)))
	}
	return g.finish()
}

function parseCartridge(image) {
	const parts = gifDecode(image)
	const nybble = x     => ((x>>13)&8) | ((x>>7)&6) | (x&1)
	const byte   = (f,i) => (nybble(parts.frames[f].palette[parts.frames[f].pixels[i  ]])<<4) |
	                        (nybble(parts.frames[f].palette[parts.frames[f].pixels[i+1]])   )
	const size = (byte(0,0)<<24) | (byte(0,2)<<16) | (byte(0,4)<<8) | byte(0,6)
	let json = ''
	for (let x = 0, i = 8, f = 0; x < size; x++) {
		json += String.fromCharCode(byte(f,i))
		i += 2
		if (i >= parts.frames[f].pixels.length) { f++; i = 0 }
	}
	return JSON.parse(json)
}

this.parseCartridge = parseCartridge;
this.buildCartridge = buildCartridge;
