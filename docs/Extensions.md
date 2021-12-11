# XO-Chip Extensions
* Multiple layers of screen as bitplanes,\
`Fn01` - Set plane bitmask mode to plane `n`\
  Octo implements 2 bitplanes, allowing 4 colors.
* Audio sampler capability, with pitch control:\
`F002` - Load 16 bytes of 1-bit audio buffer at `RAM[I]`\
`Fx3A` - Set audio pitch register to `vx`
* Clear and scroll instructions affects selected bitplanes
* 16 persistent HPS flags instead of 8
* Other added RAM load instructions:\
`5xy2` - Save range `vx` to `vy` at `RAM[I]`, doesn't change `I`\
`5xy3` - Load range `vx` to `vy` at `RAM[I]`, doesn't change `I`
* Accessible program data up to 64kb via `I`:\
`F000` `nnnn` - Set `I` to 16-bit address `nnnn`
* Any skip instructions which next with `F000` skips another 2 bytes


# Hyperchip I Extensions
* Palette of the 4 colors could be defined by program:\
`Fn03` - Load 3 bytes of `RAM[I]` as RGB to palette of plane `n`
* 4 independent voices for the sampler, and volume controls:\
`Fn38` - Select voice `n` for the rest of audio instructions\
`Fn39` - Set audio channel mask (of selected voice) to `n`\
`Fx3B` - Set audio volume register (of selected voice) to `vX`
* Persistent memory region at RAM address `0100` - `01FF`,\
  with bank on that region being switchable:\
`Fn51` - Switch bank of RAM at region `0100` - `01FF` to `vn`
* Various sprite drawing modes,\
  suppose `A` and `B` is screen and sprite pixels respectively:\
`00F0` - perform `B := A` (sprite-grab) draw mode\
`00F1` - perform `A |= B` (sprite-stamp) draw mode\
`00F2` - perform `A &=~B` (sprite-erase) draw mode\
`00F3` - perform `A ^= B` (sprite-toggle) draw mode (default)
* Quick screen manipulation:\
`00E1` - Invert screen (of selected plane(s))
* Quick comparison opcodes:\
`5xy1` - Skip if `vx` >= `vy`\
`9xy1` - Skip if `vx` < `vy`
* Big arithmetics opcodes:\
`8xyC` - Multiply `vX` by `vY`, 16-bit product to `vF`, `vX`\
`8xyD` - Divide `vX` by `vY`, quotient to `vX`, remainder to `vF`\
`8xyF` - Divide `vY` by `vX`, quotient to `vX`, remainder to `vF`
* Long branches,\
  enabling quick accessible 64kb for program codes:\
`F100` `nnnn` - Jump to 16-bit address nnnn\
`F200` `nnnn` - Call to 16-bit address nnnn\
`F300` `nnnn` - Jump to 16-bit address nnnn + v0
* Any skip instructions which next with `Fn00` skips another 2 bytes

# Hyperchip II Extensions
* 4 bitplanes of screen, allowing up to 16 colors on screen
* Double of Superchip screen resolution (256x128):\
`0100` - **256x128** mode
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
The nybble `n` split in binary as `aabb`, where `aa` is byte size,\
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

