/*
 * machina RDP helper — the smallest thing that proves the shape.
 *
 * One process per connection. Frames out on stdout, input in on stdin. No window, no X11,
 * no daemon, nothing for the operator to install: the binary and its libraries ship inside
 * the app.
 *
 * Frames go out on **fd 3**, not stdout. FreeRDP's own logger writes to stdout and cannot be
 * redirected through the public headers in every build, so a frame stream sharing it would be
 * corrupted by log lines. `child_process.spawn` hands over an extra pipe without ceremony.
 *
 * Only what changed is sent. RDP is an update protocol — the server has already told us which
 * rectangles moved — so shipping the whole framebuffer on every paint wastes the one thing the
 * protocol was careful about. A full-screen paint still costs a full frame; a blinking cursor
 * costs a cursor.
 *
 * Two kinds of message, both length-prefixed so the reader never has to guess where one ends:
 *
 *   "S" width:u32 height:u32                        the surface was (re)sized
 *   "R" x:u32 y:u32 w:u32 h:u32 bytes:u32  <rows of BGRX32, w*4 each>
 *
 * Input is one text line per event on stdin:
 *
 *   m <x> <y> <buttonmask>
 *   w <x> <y> <delta>          vertical wheel, delta in notches (positive = away from the user)
 *   k <scancode> <down:0|1>
 *   u <utf16 code unit>       one character, pressed and released
 *   c <text>                  what this machine copied, percent-encoded UTF-8
 *
 * And one more kind of message out, for what the *far* side copied:
 *
 *   "C" bytes:u32 <utf8>
 *
 * Every line waiting is read on each pass of the loop, and a run of consecutive moves collapses
 * to its last position. A pointer is a place, not a path: the intermediate points are worth
 * nothing to the far end, and reading one line per pass made the pipe a queue that the pointer
 * fell further behind with every wave of the hand.
 */

/** Frames only. See the note above. */
#define FRAME_FD 3

#include <freerdp/freerdp.h>
#include <freerdp/client.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/gdi/gfx.h>
#include <freerdp/channels/channels.h>
#include <freerdp/channels/cliprdr.h>
#include <freerdp/channels/rdpgfx.h>
#include <freerdp/client/channels.h>
#include <freerdp/client/cliprdr.h>
#include <freerdp/client/cmdline.h>
#include <freerdp/settings.h>
#include <winpr/synch.h>
#include <winpr/string.h>
#include <winpr/user.h>

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/select.h>
#include <sys/stat.h>

typedef struct
{
	rdpContext context;
	int frames;
	UINT64 bytes_sent;
	/** Which buttons were down last time, so a change can be sent as a press or a release. */
	int last_buttons;
	/** Last surface size announced, so "S" is sent on a change and not on every paint. */
	UINT32 sent_width;
	UINT32 sent_height;
	/* What `gdi_init` installed. It composes the frame; ours only copies it out. */
	pEndPaint gdi_end_paint;
	/*
	 * The clipboard channel, and what this side last copied.
	 *
	 * Both directions go through here. What the far side copies arrives as a "C" message and is
	 * put on the operator's own clipboard by the application; what the operator copies is sent
	 * down as a `c` line and kept here until the far side asks for it, which is how RDP works —
	 * a copy announces a format and the paste is what actually fetches the bytes.
	 */
	CliprdrClientContext* cliprdr;
	/*
	 * Whether the far side has said it is listening.
	 *
	 * MS-RDPECLIP is a sequence: the server sends Monitor Ready, the client answers with its
	 * capabilities, and only then may either side announce what it has. The application sends
	 * whatever is on the operator's clipboard the moment the screen opens — which is before all
	 * of that — and an announcement sent early is at best ignored. A strict server (Windows) can
	 * take the whole channel as broken, which looks exactly like this: the copy works with
	 * another client and the paste menu here stays grey.
	 */
	BOOL clipboard_ready;
	/*
	 * When the channel became usable, and whether the offer has been repeated since.
	 *
	 * The application offers whatever is on the operator's clipboard the moment a screen opens,
	 * which is a second or two before the far side has a desktop to put it on. On some servers
	 * that first offer lands in nothing: the session's clipboard owner is not up yet, and since
	 * the text does not change afterwards nothing is ever offered again. One repeat a few seconds
	 * later costs a single message and covers it — a client sends one of these on every copy
	 * anyway, so an extra is unremarkable.
	 */
	time_t clipboard_ready_at;
	BOOL clipboard_repeated;
	WCHAR* local_text;
	size_t local_bytes;
	/*
	 * The same text as bytes, for a server that asks for `CF_TEXT`.
	 *
	 * Offering only `CF_UNICODETEXT` is correct and is what Windows understands, but some
	 * versions of xrdp's clipboard server pick a format they recognise out of the list and
	 * request nothing at all when the one they wanted is missing — the channel opens, the offer
	 * goes out, and the paste menu on the far side stays grey. Microsoft's own client announces
	 * both, so both are announced here.
	 */
	char* local_utf8;
	size_t local_utf8_bytes;
} helperContext;

/* Written whole, so a partial write never desynchronises the reader. */
static BOOL write_all(const void* data, size_t length)
{
	const char* at = (const char*)data;
	size_t left = length;
	while (left > 0)
	{
		ssize_t wrote = write(FRAME_FD, at, left);
		if (wrote <= 0)
			return FALSE;
		at += wrote;
		left -= (size_t)wrote;
	}
	return TRUE;
}

/*
 * One finished frame.
 *
 * FreeRDP has already composed it into the GDI primary buffer, so this is a copy out and
 * nothing more — no decoding, no scaling. Whoever draws it decides how to present it.
 */
/** One changed rectangle, rows copied out of the framebuffer without its stride. */
static BOOL send_rect(helperContext* helper, const rdpGdi* gdi, INT32 x, INT32 y, INT32 w,
                      INT32 h)
{
	/* The server may name a rectangle that reaches past the surface. Clip, do not trust. */
	if (x < 0) { w += x; x = 0; }
	if (y < 0) { h += y; y = 0; }
	if (x + w > gdi->width) w = gdi->width - x;
	if (y + h > gdi->height) h = gdi->height - y;
	if (w <= 0 || h <= 0)
		return TRUE;

	const UINT32 ux = (UINT32)x, uy = (UINT32)y, uw = (UINT32)w, uh = (UINT32)h;
	const UINT32 row = uw * 4;
	const UINT32 bytes = row * uh;

	char header[1 + 4 * 5];
	header[0] = 'R';
	memcpy(header + 1, &ux, 4);
	memcpy(header + 5, &uy, 4);
	memcpy(header + 9, &uw, 4);
	memcpy(header + 13, &uh, 4);
	memcpy(header + 17, &bytes, 4);
	if (!write_all(header, sizeof(header)))
		return FALSE;

	for (UINT32 line = 0; line < uh; line++)
	{
		const BYTE* at = gdi->primary_buffer + (size_t)(uy + line) * gdi->stride + (size_t)ux * 4;
		if (!write_all(at, row))
			return FALSE;
	}
	helper->bytes_sent += bytes + sizeof(header);
	return TRUE;
}

static BOOL helper_end_paint(rdpContext* context)
{
	helperContext* helper = (helperContext*)context;
	rdpGdi* gdi = context->gdi;

	if (!gdi || !gdi->primary_buffer || !gdi->primary || !gdi->primary->hdc)
		return TRUE;

	/*
	 * Read the changed rectangles *before* handing over to the GDI.
	 *
	 * `gdi_end_paint` is where the invalid region is cleared, so anything read after it is an
	 * empty list — the frames arrive and every one of them looks like nothing changed.
	 */
	HGDI_WND hwnd = gdi->primary->hdc->hwnd;
	const INT32 count = hwnd ? hwnd->ninvalid : 0;

	if (helper->sent_width != (UINT32)gdi->width || helper->sent_height != (UINT32)gdi->height)
	{
		const UINT32 w = (UINT32)gdi->width, h = (UINT32)gdi->height;
		char header[1 + 4 * 2];
		header[0] = 'S';
		memcpy(header + 1, &w, 4);
		memcpy(header + 5, &h, 4);
		if (!write_all(header, sizeof(header)))
			return FALSE;
		helper->sent_width = w;
		helper->sent_height = h;
		/* A new surface has no valid history, so the first paint after it is the whole thing. */
		if (!send_rect(helper, gdi, 0, 0, gdi->width, gdi->height))
			return FALSE;
	}
	else
	{
		for (INT32 i = 0; i < count; i++)
		{
			const GDI_RGN* rgn = &hwnd->cinvalid[i];
			if (rgn->null)
				continue;
			if (!send_rect(helper, gdi, rgn->x, rgn->y, rgn->w, rgn->h))
				return FALSE;
		}
	}

	helper->frames++;
	if (helper->frames == 1)
		fprintf(stderr, "first frame %dx%d stride=%u\n", gdi->width, gdi->height, gdi->stride);

	/* Now let the GDI finish and reset the region it just told us about. */
	if (helper->gdi_end_paint && !helper->gdi_end_paint(context))
		return FALSE;
	return TRUE;
}

/**
 * A pointer position and button mask, as RDP wants them.
 *
 * RDP does not take a mask. It takes one event per transition, each carrying a `PTR_FLAGS_*`
 * word: `MOVE` for a move, `BUTTONn | DOWN` for a press, `BUTTONn` alone for a release. Passing
 * the mask straight through — 1 for the left button — sends a flag word RDP does not recognise,
 * so the pointer moves and nothing is ever clicked.
 */
static void send_pointer(helperContext* helper, rdpInput* input, INT32 x, INT32 y, int buttons)
{
	static const struct
	{
		int bit;
		UINT16 flag;
	} MAP[] = {
		{ 1, PTR_FLAGS_BUTTON1 }, /* left */
		{ 2, PTR_FLAGS_BUTTON2 }, /* right */
		{ 4, PTR_FLAGS_BUTTON3 }, /* middle */
	};

	const int changed = buttons ^ helper->last_buttons;
	if (changed == 0)
	{
		freerdp_input_send_mouse_event(input, PTR_FLAGS_MOVE, (UINT16)x, (UINT16)y);
	}
	else
	{
		for (size_t i = 0; i < sizeof(MAP) / sizeof(MAP[0]); i++)
		{
			if ((changed & MAP[i].bit) == 0)
				continue;
			const UINT16 down = (buttons & MAP[i].bit) ? PTR_FLAGS_DOWN : 0;
			freerdp_input_send_mouse_event(input, (UINT16)(MAP[i].flag | down), (UINT16)x,
			                               (UINT16)y);
		}
	}
	helper->last_buttons = buttons;
}

/** How many notches one line may ask for, so a trackpad fling cannot hold the loop. */
#define WHEEL_LIMIT 10

/**
 * A turn of the wheel.
 *
 * RDP carries the rotation inside the flag word rather than beside it: `PTR_FLAGS_WHEEL` plus a
 * magnitude in the low byte, one notch being 120 as in every other wheel protocol. Scrolling
 * towards the operator sets `PTR_FLAGS_WHEEL_NEGATIVE` *and* stores the magnitude as two's
 * complement, which is why 120 becomes 136 rather than being negated.
 */
static void send_wheel(rdpInput* input, INT32 x, INT32 y, int notches)
{
	if (notches > WHEEL_LIMIT)
		notches = WHEEL_LIMIT;
	if (notches < -WHEEL_LIMIT)
		notches = -WHEEL_LIMIT;

	while (notches != 0)
	{
		const int step = notches > 0 ? 1 : -1;
		const UINT16 flags =
		    step > 0 ? (UINT16)(PTR_FLAGS_WHEEL | 120)
		             : (UINT16)(PTR_FLAGS_WHEEL | PTR_FLAGS_WHEEL_NEGATIVE | (256 - 120));
		freerdp_input_send_mouse_event(input, flags, (UINT16)x, (UINT16)y);
		notches -= step;
	}
}

/** Defined below with the rest of the clipboard: what the operator copied, on its way down. */
static void take_local_clipboard(helperContext* helper, const char* encoded);

/**
 * Take everything waiting on stdin.
 *
 * Two rules make the pointer feel attached to the hand. Every line waiting is read in one pass,
 * so a burst never becomes a backlog — reading a single line per pass of the outer loop capped
 * input at one event per wait and the pointer fell further behind with every wave. And a run of
 * consecutive moves collapses to its last position, because the far end wants where the pointer
 * *is*, not every place it has been.
 *
 * "Every line waiting" means the descriptor, not stdio's idea of it. See the note inside.
 *
 * A press, a release and a wheel each carry their own coordinates, so a move pending in front of
 * one is simply dropped: the transition already says where it happened.
 *
 * Returns FALSE when stdin reached EOF. That ends the input channel, not the session.
 */
static BOOL drain_input(helperContext* helper, rdpContext* context)
{
	/*
	 * `read`, and our own line splitting, because `fgets` and `select` do not agree.
	 *
	 * `fgets` fills stdio's buffer — several kilobytes at a time — and hands back one line. The
	 * rest sit inside stdio, where `select` cannot see them: it reports the descriptor as empty,
	 * this loop stops, and the lines already read stay stuck until something else arrives to
	 * wake it. A wave of the hand hid it, because a move is followed by another move. A burst
	 * from the agent did not: `type_text` writes every key at once, and 100 characters left
	 * 56 bytes on the wire.
	 */
	static char held[16384];
	static size_t kept = 0;

	BOOL have_move = FALSE;
	INT32 move_x = 0;
	INT32 move_y = 0;
	BOOL open = TRUE;

	while (kept < sizeof(held) - 1)
	{
		fd_set reads;
		FD_ZERO(&reads);
		FD_SET(STDIN_FILENO, &reads);
		struct timeval nowait = { 0, 0 };
		if (select(STDIN_FILENO + 1, &reads, NULL, NULL, &nowait) <= 0)
			break;

		ssize_t got = read(STDIN_FILENO, held + kept, sizeof(held) - 1 - kept);
		if (got < 0)
		{
			if (errno == EINTR || errno == EAGAIN)
				continue;
			open = FALSE;
			break;
		}
		if (got == 0)
		{
			open = FALSE;
			break;
		}
		kept += (size_t)got;
	}

	size_t at = 0;
	for (;;)
	{
		char* end = memchr(held + at, '\n', kept - at);
		if (!end)
			break;
		*end = '\0';
		const char* line = held + at;
		at = (size_t)(end - held) + 1;

		int a = 0, b = 0, c = 0;
		if (sscanf(line, "m %d %d %d", &a, &b, &c) == 3)
		{
			if (c == helper->last_buttons)
			{
				have_move = TRUE;
				move_x = a;
				move_y = b;
				continue;
			}
			have_move = FALSE;
			send_pointer(helper, context->input, a, b, c);
		}
		else if (sscanf(line, "w %d %d %d", &a, &b, &c) == 3)
		{
			have_move = FALSE;
			send_wheel(context->input, a, b, c);
		}
		else if (sscanf(line, "k %d %d", &a, &b) == 2)
		{
			freerdp_input_send_keyboard_event(context->input,
			                                  (UINT16)(b ? 0 : KBD_FLAGS_RELEASE), (UINT8)a);
		}
		else if (sscanf(line, "u %d", &a) == 1)
		{
			/*
			 * A character, not a key.
			 *
			 * Scan codes name a place on a US keyboard, so anything outside that layout cannot
			 * be typed with them — this is how Japanese goes across. RDP carries it as UTF-16
			 * code units on their own event, which the far end delivers as typed text without
			 * an input method being involved on either side. Held has no meaning for a
			 * character, so each one is a press and a release together.
			 */
			if (!freerdp_input_send_unicode_keyboard_event(context->input, 0, (UINT16)a) ||
			    !freerdp_input_send_unicode_keyboard_event(context->input, KBD_FLAGS_RELEASE,
			                                               (UINT16)a))
				fprintf(stderr, "unicode refused %d\n", a);
		}
		else if (line[0] == 'c' && line[1] == ' ')
		{
			take_local_clipboard(helper, line + 2);
		}
	}

	/* Whatever is left is half a line. Keep it for the next pass — unless it fills the buffer,
	 * in which case it is not a line at all and holding it would stop input for good. */
	if (at > 0)
	{
		memmove(held, held + at, kept - at);
		kept -= at;
	}
	else if (kept >= sizeof(held) - 1)
		kept = 0;

	if (have_move)
		send_pointer(helper, context->input, move_x, move_y, helper->last_buttons);
	return open;
}


/*
 * The clipboard, both ways.
 *
 * RDP does not send what was copied; it announces that something was copied and in which
 * formats, and the other side asks for the bytes when somebody actually pastes. So four
 * exchanges: the far side's announcement (we ask for the text), its answer (we hand the text up
 * as a "C" message), our announcement (after a `c` line arrives), and its request (we hand over
 * the bytes we kept). Only CF_UNICODETEXT — text is what an operator moves between a maintenance
 * window and a customer's desktop, and files would be a transfer with rules of its own.
 */

/** Announce that this side has text. Sent after every `c` line, which is what a copy becomes. */
static UINT cliprdr_announce(helperContext* helper)
{
	/* Kept, not sent, until the exchange has got as far as Monitor Ready. */
	if (!helper->cliprdr || !helper->clipboard_ready || !helper->local_text)
		return CHANNEL_RC_OK;

	CLIPRDR_FORMAT formats[2] = { { 0 }, { 0 } };
	formats[0].formatId = CF_UNICODETEXT;
	formats[0].formatName = NULL;
	formats[1].formatId = CF_TEXT;
	formats[1].formatName = NULL;

	CLIPRDR_FORMAT_LIST list = { 0 };
	list.common.msgType = CB_FORMAT_LIST;
	list.numFormats = 2;
	list.formats = formats;
	const UINT status = helper->cliprdr->ClientFormatList(helper->cliprdr, &list);
	fprintf(stderr, "clipboard offered %zu bytes status=%u\n", helper->local_bytes, status);
	return status;
}

/** The channel is up. Say what we can do, then offer whatever was copied before it opened. */
static UINT cliprdr_monitor_ready(CliprdrClientContext* context,
                                  const CLIPRDR_MONITOR_READY* ready)
{
	(void)ready;
	helperContext* helper = (helperContext*)context->custom;

	CLIPRDR_GENERAL_CAPABILITY_SET general = { 0 };
	general.capabilitySetType = CB_CAPSTYPE_GENERAL;
	general.capabilitySetLength = CB_CAPSTYPE_GENERAL_LEN;
	general.version = CB_CAPS_VERSION_2;
	general.generalFlags = CB_USE_LONG_FORMAT_NAMES;

	CLIPRDR_CAPABILITIES capabilities = { 0 };
	capabilities.cCapabilitiesSets = 1;
	capabilities.capabilitySets = (CLIPRDR_CAPABILITY_SET*)&general;

	UINT status = context->ClientCapabilities(context, &capabilities);
	if (status != CHANNEL_RC_OK)
		return status;
	/* Now, and not before: whatever was copied while this was still opening goes out here. */
	helper->clipboard_ready = TRUE;
	helper->clipboard_ready_at = time(NULL);
	helper->clipboard_repeated = FALSE;
	fprintf(stderr, "clipboard ready\n");
	return cliprdr_announce(helper);
}

/** The far side copied something. Answer the announcement, and ask for the text if it has any. */
static UINT cliprdr_server_format_list(CliprdrClientContext* context,
                                       const CLIPRDR_FORMAT_LIST* list)
{
	CLIPRDR_FORMAT_LIST_RESPONSE response = { 0 };
	response.common.msgType = CB_FORMAT_LIST_RESPONSE;
	response.common.msgFlags = CB_RESPONSE_OK;
	UINT status = context->ClientFormatListResponse(context, &response);
	if (status != CHANNEL_RC_OK)
		return status;

	for (UINT32 i = 0; i < list->numFormats; i++)
	{
		if (list->formats[i].formatId != CF_UNICODETEXT)
			continue;
		CLIPRDR_FORMAT_DATA_REQUEST request = { 0 };
		request.common.msgType = CB_FORMAT_DATA_REQUEST;
		request.requestedFormatId = CF_UNICODETEXT;
		return context->ClientFormatDataRequest(context, &request);
	}
	return CHANNEL_RC_OK;
}

/** The text itself. Out it goes, as UTF-8, for the application to put on the real clipboard. */
static UINT cliprdr_server_format_data_response(CliprdrClientContext* context,
                                                const CLIPRDR_FORMAT_DATA_RESPONSE* response)
{
	if ((response->common.msgFlags & CB_RESPONSE_FAIL) != 0 || response->common.dataLen < 2)
		return CHANNEL_RC_OK;

	const size_t units = response->common.dataLen / sizeof(WCHAR);
	size_t length = 0;
	char* utf8 = ConvertWCharNToUtf8Alloc((const WCHAR*)response->requestedFormatData, units,
	                                      &length);
	if (!utf8)
		return CHANNEL_RC_OK;

	/* The far end terminates its string; the length we send should not include the null. */
	while (length > 0 && utf8[length - 1] == '\0')
		length--;

	if (length > 0 && length < 0x40000000)
	{
		const UINT32 bytes = (UINT32)length;
		char header[1 + 4];
		header[0] = 'C';
		memcpy(header + 1, &bytes, 4);
		if (write_all(header, sizeof(header)))
			write_all(utf8, length);
	}
	free(utf8);
	return CHANNEL_RC_OK;
}

/** The far side is pasting. Hand over what this side copied, or say there is nothing. */
static UINT cliprdr_server_format_data_request(CliprdrClientContext* context,
                                               const CLIPRDR_FORMAT_DATA_REQUEST* request)
{
	helperContext* helper = (helperContext*)context->custom;
	CLIPRDR_FORMAT_DATA_RESPONSE response = { 0 };
	response.common.msgType = CB_FORMAT_DATA_RESPONSE;

	fprintf(stderr, "clipboard asked for format %u (have text: %s)\n", request->requestedFormatId,
	        helper->local_text ? "yes" : "no");
	if (!helper->local_text)
	{
		response.common.msgFlags = CB_RESPONSE_FAIL;
		return context->ClientFormatDataResponse(context, &response);
	}

	/*
	 * `CF_TEXT` is bytes rather than UTF-16, and on a Windows server it would be that machine's
	 * ANSI code page. What is sent is UTF-8, which is what a Linux server's clipboard wants and
	 * what every byte of ASCII already is — and ASCII is what a maintenance window mostly moves.
	 * A server that can read UTF-16 asks for `CF_UNICODETEXT` and gets it exactly.
	 */
	if (request->requestedFormatId == CF_TEXT && helper->local_utf8)
	{
		response.common.msgFlags = CB_RESPONSE_OK;
		response.common.dataLen = (UINT32)helper->local_utf8_bytes;
		response.requestedFormatData = (const BYTE*)helper->local_utf8;
		return context->ClientFormatDataResponse(context, &response);
	}
	if (request->requestedFormatId != CF_UNICODETEXT)
	{
		response.common.msgFlags = CB_RESPONSE_FAIL;
		return context->ClientFormatDataResponse(context, &response);
	}

	response.common.msgFlags = CB_RESPONSE_OK;
	response.common.dataLen = (UINT32)helper->local_bytes;
	response.requestedFormatData = (const BYTE*)helper->local_text;
	return context->ClientFormatDataResponse(context, &response);
}

/** Nothing to do, but the channel expects somebody to be listening. */
static UINT cliprdr_server_format_list_response(CliprdrClientContext* context,
                                                const CLIPRDR_FORMAT_LIST_RESPONSE* response)
{
	(void)context;
	(void)response;
	return CHANNEL_RC_OK;
}

/** `c <percent-encoded UTF-8>`: what the operator copied on this machine. */
static void take_local_clipboard(helperContext* helper, const char* encoded)
{
	char* plain = (char*)malloc(strlen(encoded) + 1);
	if (!plain)
		return;
	size_t out = 0;
	for (size_t i = 0; encoded[i] != '\0'; i++)
	{
		if (encoded[i] == '%' && encoded[i + 1] && encoded[i + 2])
		{
			char pair[3] = { encoded[i + 1], encoded[i + 2], '\0' };
			plain[out++] = (char)strtol(pair, NULL, 16);
			i += 2;
		}
		else
			plain[out++] = encoded[i];
	}
	plain[out] = '\0';

	size_t units = 0;
	WCHAR* wide = ConvertUtf8NToWCharAlloc(plain, out, &units);
	if (!wide)
	{
		free(plain);
		return;
	}

	free(helper->local_text);
	helper->local_text = wide;
	/* The same text as bytes, for a server that asks for CF_TEXT. Null-terminated, as the format
	   wants. `plain` becomes that copy rather than being freed and made again. */
	free(helper->local_utf8);
	helper->local_utf8 = plain;
	helper->local_utf8_bytes = out + 1;
	/* The far end wants the terminating null counted, as Windows does for CF_UNICODETEXT. */
	helper->local_bytes = (units + 1) * sizeof(WCHAR);
	fprintf(stderr, "clipboard from this machine: %zu characters (channel %s)\n", units,
	        helper->clipboard_ready ? "ready" : "not ready yet");
	cliprdr_announce(helper);
}

/**
 * The graphics pipeline, joined to the GDI when its channel opens.
 *
 * FreeRDP hands the channel to whoever asked to be told; without this the surfaces arrive and
 * nothing draws them. The reverse on disconnect matters too — the pipeline holds pointers into
 * the GDI, and freeing one while the other still has it is how a clean disconnect turns into a
 * crash.
 */
static void helper_channel_connected(void* context, const ChannelConnectedEventArgs* e)
{
	rdpContext* rdp = (rdpContext*)context;
	if (strcmp(e->name, RDPGFX_DVC_CHANNEL_NAME) == 0)
		gdi_graphics_pipeline_init(rdp->gdi, (RdpgfxClientContext*)e->pInterface);
	else if (strcmp(e->name, CLIPRDR_SVC_CHANNEL_NAME) == 0)
	{
		helperContext* helper = (helperContext*)rdp;
		CliprdrClientContext* clip = (CliprdrClientContext*)e->pInterface;
		helper->cliprdr = clip;
		fprintf(stderr, "clipboard channel open\n");
		clip->custom = helper;
		clip->MonitorReady = cliprdr_monitor_ready;
		clip->ServerFormatList = cliprdr_server_format_list;
		clip->ServerFormatListResponse = cliprdr_server_format_list_response;
		clip->ServerFormatDataRequest = cliprdr_server_format_data_request;
		clip->ServerFormatDataResponse = cliprdr_server_format_data_response;
	}
}

static void helper_channel_disconnected(void* context, const ChannelDisconnectedEventArgs* e)
{
	rdpContext* rdp = (rdpContext*)context;
	if (strcmp(e->name, RDPGFX_DVC_CHANNEL_NAME) == 0)
		gdi_graphics_pipeline_uninit(rdp->gdi, (RdpgfxClientContext*)e->pInterface);
	else if (strcmp(e->name, CLIPRDR_SVC_CHANNEL_NAME) == 0)
	{
		helperContext* helper = (helperContext*)rdp;
		helper->cliprdr = NULL;
		helper->clipboard_ready = FALSE;
	}
}

/**
 * The desktop changed size.
 *
 * Required, not optional, once the graphics pipeline is on: `gdi_ResetGraphics` asserts on this
 * callback being present, and the pipeline calls it as soon as the server describes its output.
 * All it has to do is grow the buffer — the size is announced to the reader by `helper_end_paint`
 * on the next paint, which sees `gdi->width` no longer matching what it last sent and follows
 * the "S" with a full frame.
 */
static BOOL helper_desktop_resize(rdpContext* context)
{
	return gdi_resize(context->gdi,
	                  freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopWidth),
	                  freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopHeight));
}

/**
 * Ask FreeRDP for the channels this connection needs.
 *
 * A client built from `freerdp_client_context_new` starts with no channel clients at all — the
 * command-line clients get theirs from `/gfx` and friends. Without this call the server is told
 * the pipeline is supported, sends its surfaces down a channel nobody opened, and the frame
 * count stays at zero while the connection looks perfectly healthy.
 */
static BOOL helper_pre_connect(freerdp* instance)
{
	rdpContext* context = instance->context;
	freerdp_settings_set_bool(context->settings, FreeRDP_SupportDynamicChannels, TRUE);
	/* Without this the addin loader never opens `cliprdr`, and copy stops at the window edge. */
	freerdp_settings_set_bool(context->settings, FreeRDP_RedirectClipboard, TRUE);

	PubSub_SubscribeChannelConnected(context->pubSub, helper_channel_connected);
	PubSub_SubscribeChannelDisconnected(context->pubSub, helper_channel_disconnected);

	return freerdp_client_load_addins(context->channels, context->settings);
}

static BOOL helper_post_connect(freerdp* instance)
{
	/* BGRX32: one word per pixel, no palette, the same thing a canvas wants. */
	if (!gdi_init(instance, PIXEL_FORMAT_BGRX32))
		return FALSE;

	helperContext* helper = (helperContext*)instance->context;
	helper->gdi_end_paint = instance->context->update->EndPaint;
	instance->context->update->EndPaint = helper_end_paint;
	instance->context->update->DesktopResize = helper_desktop_resize;

	rdpGdi* gdi = instance->context->gdi;
	fprintf(stderr, "connected gdi=%dx%d buffer=%s\n", gdi ? gdi->width : -1,
	        gdi ? gdi->height : -1, (gdi && gdi->primary_buffer) ? "yes" : "no");
	/*
	 * Whether `u` will do anything.
	 *
	 * The server says in its input capability set whether it accepts Unicode key events. FreeRDP
	 * drops them silently when it did not, so without this line "the agent typed Japanese and
	 * nothing happened" is indistinguishable from a lost keystroke.
	 */
	fprintf(stderr, "unicode %d\n",
	        freerdp_settings_get_bool(instance->context->settings, FreeRDP_UnicodeInput) ? 1 : 0);
	return TRUE;
}

static void helper_post_disconnect(freerdp* instance)
{
	if (instance && instance->context)
		gdi_free(instance);
}

/* No prompting: this helper is spawned by an app, and there is no terminal to ask on. */
static BOOL helper_authenticate(freerdp* instance, char** username, char** password,
                                char** domain)
{
	(void)instance;
	(void)username;
	(void)password;
	(void)domain;
	return FALSE;
}

/**
 * The certificate this server should be showing, or empty on a first meeting.
 *
 * Passed in rather than looked up: which servers have been met before is the application's
 * memory, not this process's, and a helper that kept its own list would disagree with it.
 */
static const char* expected_fingerprint = "";

static DWORD helper_verify_certificate(freerdp* instance, const char* host, UINT16 port,
                                       const char* common_name, const char* subject,
                                       const char* issuer, const char* fingerprint,
                                       DWORD flags)
{
	(void)instance;
	(void)common_name;
	(void)subject;
	(void)issuer;
	(void)flags;

	/*
	 * Reported either way, so the application can record a first meeting.
	 *
	 * On its own line with a tag, because stderr also carries FreeRDP's own logging.
	 */
	fprintf(stderr, "certificate %s\n", fingerprint ? fingerprint : "");
	fflush(stderr);

	if (expected_fingerprint[0] == '\0')
	{
		/*
		 * 1 = accept for this session only.
		 *
		 * A maintenance tool talks to machines whose certificates are self-signed almost by
		 * definition, so the first meeting cannot be decided by a chain. What can be decided is
		 * every meeting after it, which is what the comparison below is for.
		 */
		return 1;
	}

	if (fingerprint && strcmp(fingerprint, expected_fingerprint) == 0)
		return 1;

	fprintf(stderr, "certificate changed %s:%u expected %s\n", host, (unsigned)port,
	        expected_fingerprint);
	fflush(stderr);
	return 0;
}

static BOOL helper_client_new(freerdp* instance, rdpContext* context)
{
	(void)context;
	instance->PreConnect = helper_pre_connect;
	instance->PostConnect = helper_post_connect;
	instance->PostDisconnect = helper_post_disconnect;
	instance->Authenticate = helper_authenticate;
	instance->VerifyCertificateEx = helper_verify_certificate;
	return TRUE;
}

int main(int argc, char** argv)
{
	if (argc < 5)
	{
		fprintf(stderr,
		        "usage: %s <host> <port> <user> <password> [width] [height] [fingerprint]\n",
		        argv[0]);
		return 2;
	}

	RDP_CLIENT_ENTRY_POINTS entry = { 0 };
	entry.Size = sizeof(entry);
	entry.Version = RDP_CLIENT_INTERFACE_VERSION;
	entry.ContextSize = sizeof(helperContext);
	entry.ClientNew = helper_client_new;

	rdpContext* context = freerdp_client_context_new(&entry);
	if (!context)
	{
		fprintf(stderr, "context failed\n");
		return 1;
	}

	rdpSettings* settings = context->settings;
	freerdp_settings_set_string(settings, FreeRDP_ServerHostname, argv[1]);
	freerdp_settings_set_uint32(settings, FreeRDP_ServerPort, (UINT32)atoi(argv[2]));
	freerdp_settings_set_string(settings, FreeRDP_Username, argv[3]);
	freerdp_settings_set_string(settings, FreeRDP_Password, argv[4]);
	freerdp_settings_set_uint32(settings, FreeRDP_DesktopWidth, argc > 5 ? (UINT32)atoi(argv[5]) : 1280);
	freerdp_settings_set_uint32(settings, FreeRDP_DesktopHeight, argc > 6 ? (UINT32)atoi(argv[6]) : 800);
	if (argc > 7)
		expected_fingerprint = argv[7];

	/*
	 * FreeRDP must not keep its own memory of this server.
	 *
	 * It caches accepted certificates under `~/.config/freerdp` and, when one matches, never
	 * calls `VerifyCertificateEx` at all — so the comparison above would run only on the visits
	 * where FreeRDP was already unhappy, and a store the operator cannot see would be deciding
	 * who they are talking to. Pointed at an empty directory, FreeRDP treats every certificate
	 * as new and asks, and the one record of what this server looked like lives in the app.
	 */
	char config_path[] = "/tmp/machina-rdp-XXXXXX";
	if (mkdtemp(config_path))
		freerdp_settings_set_string(settings, FreeRDP_ConfigPath, config_path);
	freerdp_settings_set_uint32(settings, FreeRDP_ColorDepth, 32);
	/* Compose in software: this helper wants pixels in a buffer, not on a screen. */
	freerdp_settings_set_bool(settings, FreeRDP_SoftwareGdi, TRUE);
	/*
	 * The graphics pipeline, now that it is wired.
	 *
	 * EGFX delivers frames through its own surface commands and never reaches `EndPaint`, which
	 * is why this was off: the connection succeeded and the frame count stayed at zero. Three
	 * things were missing, and all three are here now — `freerdp_client_load_addins` to open the
	 * channel at all (`helper_pre_connect`), `gdi_graphics_pipeline_init` to join it to the GDI
	 * (`helper_channel_connected`), and an `update->DesktopResize` for the pipeline to call
	 * (`helper_desktop_resize`), without which it asserts. After that the pipeline draws into
	 * the same buffer and calls the same `EndPaint` this helper already hooks.
	 *
	 * Not a bandwidth decision. Measured against the xrdp test server, EGFX costs *more* on the
	 * wire than the legacy path did — 225 KB against 90 KB for the same five seconds and the
	 * same pointer movement — because that server answers the pipeline with uncompressed surface
	 * commands while its legacy path used compressed bitmaps and caching. It is on because it is
	 * where Windows puts the desktop: a modern Windows server that has negotiated EGFX sends the
	 * interesting parts of the screen down this channel and nowhere else, and a client that
	 * declines it is choosing an older, thinner picture. What it costs on a real link, against a
	 * real Windows server that offers a codec, is not measured yet.
	 */
	freerdp_settings_set_bool(settings, FreeRDP_SupportGraphicsPipeline, TRUE);
	/*
	 * Not ignored — checked by `helper_verify_certificate` above.
	 *
	 * `IgnoreCertificate` skips the callback entirely, so with it set there was nothing to
	 * compare and nothing to report: any machine answering on this address was accepted.
	 */
	freerdp_settings_set_bool(settings, FreeRDP_IgnoreCertificate, FALSE);

	if (!freerdp_connect(context->instance))
	{
		fprintf(stderr, "connect failed: 0x%08X\n", freerdp_get_last_error(context));
		freerdp_client_context_free(context);
		return 1;
	}

	/* Frames arrive on FreeRDP's own handles; input arrives on stdin. Wait on both. */
	BOOL stdin_open = TRUE;
	time_t started = time(NULL);
	time_t reported = 0;
	while (!freerdp_shall_disconnect_context(context))
	{
		/* One line a second, so "no frames" can be told apart from "loop died". */
		time_t now = time(NULL);
		helperContext* helper = (helperContext*)context;
		if (helper->clipboard_ready && !helper->clipboard_repeated && helper->local_text &&
		    now - helper->clipboard_ready_at >= 4)
		{
			helper->clipboard_repeated = TRUE;
			fprintf(stderr, "clipboard offering again, now that the session has had a moment\n");
			cliprdr_announce(helper);
		}
		if (now != reported)
		{
			reported = now;
			fprintf(stderr, "t=%lds frames=%d\n", (long)(now - started),
			        ((helperContext*)context)->frames);
		}

		HANDLE handles[64];
		DWORD count = freerdp_get_event_handles(context, handles, 63);
		if (count == 0)
			break;

		/*
		 * Short, because this wait is also the pointer's latency.
		 *
		 * Input arrives on stdin, which is not one of these handles, so nothing here wakes on a
		 * mouse move — the loop finds it only on the next pass. At 50ms that ceiling was visible
		 * as lag against a server on this very machine. Five costs a few hundred idle wakeups a
		 * second and buys a pointer that keeps up with the hand.
		 */
		if (WaitForMultipleObjects(count, handles, FALSE, 5) == WAIT_FAILED)
			break;

		if (!freerdp_check_event_handles(context))
			break;

		/*
		 * EOF on stdin is not a reason to stop.
		 *
		 * It ends the input channel, not the session — and a helper started without a parent
		 * holding stdin open would otherwise exit before the first frame, which looks exactly
		 * like "the server sent nothing".
		 */
		if (stdin_open && !drain_input((helperContext*)context, context))
			stdin_open = FALSE;
	}

	fprintf(stderr, "frames=%d sent=%.1fMB\n", ((helperContext*)context)->frames,
	        ((helperContext*)context)->bytes_sent / 1048576.0);
	/* Whatever FreeRDP wrote in there is a copy of what the app already recorded. */
	if (config_path[0])
	{
		char pem[sizeof(config_path) + 64];
		snprintf(pem, sizeof(pem), "%s/server", config_path);
		remove(pem);
		rmdir(config_path);
	}
	freerdp_disconnect(context->instance);
	freerdp_client_context_free(context);
	return 0;
}
