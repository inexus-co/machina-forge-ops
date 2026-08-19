# machina-rdp — the RDP helper

One process per connection. It connects, hands back the pixels that changed, and takes input.
No window, no X11, no daemon: the operator installs nothing.

```
Forge (main, Node)
  └─ spawn machina-rdp <host> <port> <user> <password> [w] [h]
       ├─ fd 3   → screen              "S" w h  /  "R" x y w h bytes <BGRX32 rows>
       ├─ stdin  ← input               "m x y buttons"  /  "k scancode down"
       └─ stderr → log
```

## Why a separate process and not a native addon

An addon has to be rebuilt for Electron's ABI on every upgrade, for every platform. A plain
executable does not care what is running it. The cost is a pipe, which the frame stream wanted
anyway.

## Why fd 3

FreeRDP's own logger writes to stdout and cannot be redirected through the public headers in
every build. A screen stream sharing that channel is corrupted by log lines the first time
anything goes wrong. `child_process.spawn` hands over an extra pipe without ceremony.

## Only what changed

RDP is an update protocol: the server has already worked out which rectangles moved. Sending the
whole framebuffer on every paint throws that away — measured at 688 MB against 85 MB for the same
22 seconds. The rectangles come from the GDI's invalid region, which must be read **before**
`gdi_end_paint` runs, because that is what clears it.

## Building

Needs FreeRDP 3 headers and libraries.

```bash
brew install freerdp          # macOS, development only
./build.sh
```

The build writes `bin/<platform>-<arch>/machina-rdp`. What ships in the app is that binary plus
the FreeRDP libraries it links, with their install names rewritten to `@loader_path` so nothing
outside the app is required at run time.

## Known gaps

- **The graphics pipeline is off** (`SupportGraphicsPipeline = FALSE`). EGFX delivers frames
  through its own surface commands and never reaches `EndPaint`, so turning it off was the short
  path to pixels. Wiring `gdi_graphics_pipeline_init` is the long one and is worth doing: it is
  where H.264 and the bandwidth savings live.
- **Certificates are accepted for the session.** The helper reports the fingerprint on stderr;
  deciding what to do about it belongs to the app, which can show it to a person.
- **One rectangle is one write.** Coalescing the rectangles of a single paint would cut the
  syscall count on a busy screen.
