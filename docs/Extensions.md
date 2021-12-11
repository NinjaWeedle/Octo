# XO-Chip Extensions
* Multiple bitplanes (layers),\
`Fn01` - Set plane bitmask mode to plane `n`\
  Octo implements 2 bitplanes, allowing 4 colors.
* Audio sampler capability, with pitch control:\
`F002` - Load 16 bytes from memory starting at I (`RAM[I]`) into the 1-bit audio buffer. \
`Fx3A` - Set audio pitch register to `vx`
* Clear and scroll instructions affects selected bitplanes
* 16 persistent RPL user flags instead of 8.
* Other added RAM load instructions:\
`5xy2` - Save range `vx` to `vy` at `RAM[I]`, doesn't change `I`\
`5xy3` - Load range `vx` to `vy` at `RAM[I]`, doesn't change `I`
* Accessible program data up to 64kb via `I`:\
`F000` `nnnn` - Set `I` to 16-bit address `nnnn`
* Any skip instructions that skip over the Long branch ops (Fn00) must skip another 2 bytes so as to skip over the whole op.


# Hyperchip I Extensions
* Palette of the 4 colors could be defined by program:\
`Fn03` - Load 3 bytes from memory starting at I ( `RAM[I]`) in RRGGBB format as palette of plane `n`. I is not incremented.
* 4 independent voices for the sampler, and volume controls:\
`Fn38` - Select voice `n` for the rest of audio instructions\
`Fn39` - Set audio channel mask (of selected voice) to `n`\
`Fx3B` - Set audio volume register (of selected voice) to `vX`
* Persistent memory region at RAM address `0100` - `01FF`,\
  with the bank in that region being switchable:\
`Fn51` - Switch bank of RAM at region `0100` - `01FF` to `vn`
* Various sprite drawing modes,\
  suppose `A` and `B` is screen and sprite pixels respectively:\
`00F0` - perform `B := A` (sprite-grab) draw mode\
`00F1` - perform `A |= B` (sprite-stamp) draw mode (A.K.A OR mode). VF is set to 1 if pixels are already enabled when drawing and 0 otherwise.\
`00F2` - perform `A &=~B` (sprite-erase) draw mode (A.K.A ERASE mode). VF is set to 1 if pixels are erased when drawing and 0 otherwise.\
`00F3` - perform `A ^= B` (sprite-toggle) draw mode (A.K.A XOR mode) (default). VF is set to 1 if pixels are erased when drawing and 0 otherwise.\
* Quick screen manipulation:\
`00E1` - Invert screen (of currently selected plane).
* Quick comparison opcodes:\
`5xy1` - SKP vX > vY - Skip if `vx` > `vy`\
`9xy1` - SKP vX =< vY - Skip if `vx` =< `vy`\
* Big arithmetic opcodes:\
`8xyC` - vX = vX * vY - Multiply `vX` by `vY`, 16-bit product (higher 8 bits of the product) to `vF`, `vX`\
`8xyD` - vX = vX / vY - Divide `vX` by `vY`, setting quotient to `vX`, and remainder to `vF`\
`8xyF` - vX = vY / vX - Divide `vY` by `vX`, setting quotient to `vX`, and remainder to `vF`
* If the denominatior is 0 in 8XYD or 8XYF, both VX and VF are set to zero.
* Long branches,\
  enabling quick accessible 64kb for program codes:\
`F100` `nnnn` - Long Jump - Jump to 16-bit address nnnn\
`F200` `nnnn` - Long Call - Call Subroutine to 16-bit address nnnn\
`F300` `nnnn` - Long Jump0 - Jump to 16-bit address nnnn + v0
* Any skip instructions that skip over the Long branch ops (Fn00) must skip another 2 bytes so as to skip over the whole op.

# Hyperchip II Extensions
* 4 bitplanes of screen, allowing up to 16 colors on screen
* Double Superchip screen resolution (256x128):\
`0100` - XRES MODE -  **256x128** mode
* Scaleable and pannable screen for the screen renderer:\
`0101` - **1x** scaling mode (default)\
`0102` - **2x** scaling mode (show half of resolution)\
`0103` - **4x** scaling mode (show quarter of resolution)\
`FnD0` - Screen pan X (of selected plane(s)) to `vn` \
`FnD1` - Screen pan Y (of selected plane(s)) to `vn`
* Audio sampler buffer mode could be defined by program:\
`F002` - buffer **16 bytes** of **1-bit** audio (128 samples)\
`F102` - buffer **16 bytes** of **2-bit** audio (64 samples)\
`F202` - buffer **16 bytes** of **4-bit** audio (32 samples)\
`F302` - buffer **16 bytes** of **8-bit** audio (16 samples)\
`F402` - buffer **32 bytes** of **1-bit** audio (256 samples)\
`F502` - buffer **32 bytes** of **2-bit** audio (128 samples)\
`F602` - buffer **32 bytes** of **4-bit** audio (64 samples)\
`F702` - buffer **32 bytes** of **8-bit** audio (32 samples)\
`F802` - buffer **64 bytes** of **1-bit** audio (512 samples)\
`F902` - buffer **64 bytes** of **2-bit** audio (256 samples)\
`FA02` - buffer **64 bytes** of **4-bit** audio (128 samples)\
`FB02` - buffer **64 bytes** of **8-bit** audio (64 samples)\
`FC02` - buffer **128 bytes** of **1-bit** audio (1024 samples)\
`FD02` - buffer **128 bytes** of **2-bit** audio (512 samples)\
`FE02` - buffer **128 bytes** of **4-bit** audio (256 samples)\
`FF02` - buffer **128 bytes** of **8-bit** audio (128 samples)\
Concisely, it's `Fn02`, to load audio buffer with mode `n`.\
The nybble `n` is split in binary as `aabb`, where `aa` is byte size,\
and `bb` is bit depth.
* New 24-bit `J` pointer to access ROM (similar to `I` for RAM),\
  enabling larger program data theoretically up to 2MB size:\
`9XY2` - Load range `vx` to `vy` from `ROM[J]`, J is unchanged\
`Fn45` - Load `v0` to `vn` from `ROM[J]`, J is incremented by N + 1\
`Fn4A` - Increment `J` by `vn`\
Suppose JB is the first 8-bit of J, and JA is the least 16-bit of J:\
`F400` `nnnn`- Set JA to nnnn\
`Fn40` - Set JB to vn

---

