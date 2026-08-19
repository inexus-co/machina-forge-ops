# Working rules for forge-ops

A desktop application that goes into a customer's running server over RDP, VNC and SSH, and has an
agent maintain it.

## Instructions

1. **Answer in Japanese.**
2. **No emoji.**
3. **Stop and ask when something is unclear. Never build on a guess.**
4. **Never run `git checkout` / `git restore` / `git stash` unless told to.** The working tree
   belongs to the operator.
5. **Commit only after showing what is in it and getting a yes. Push only when told to, every
   time.**

## Rules for the screens

Only the ones that were broken are written down. Every one of them was broken for real, and
complained about.

### 1. Adding, creating and typing happen in a Modal

"Add a server", "add a model", "sign in" — **anything that asks for input is a Modal.** Do not
push a field or an explanation into the content that is already on screen. The moment you do,
everything around it moves and the button somebody was reaching for runs away.

- The content area is not somewhere to put a form
- The more temporary a thing is, the more it belongs in a Modal. Something that lingers after it
  was needed moves everything again when it finally goes
- **A Modal edits a copy.** Half-typed input must never show through to the list behind it:
  something not added yet, sitting in the list, is a lie. It lands when "add" or "save" is
  pressed, and nowhere else. Cancel and nothing is left behind

### 2. The layout does not move

**Changing what is in something does not change its size.**

- A Modal's height is fixed. Switching tabs, or having more inside, does not change it
- Buttons stay at the bottom right. How much is above them does not move them
- Never show a selection with `font-weight` — bold text is wider text. Colour and background only
- **A button whose label changes uses `SwapLabel`.** Never swap the words with a ternary like
  `{open ? "hide" : "show"}`. `SwapLabel` puts both words in the same place and takes its width
  from the longer one, so pressing it moves nothing. Show/hide, expand all/collapse all,
  reload/loading…, save/saving… — **without exception.** A width that changes on the press makes
  the neighbouring button run away, and the second press misses
- A small button that is only a verb gets an icon beside it (what it does reads faster than the
  word alone)

### 3. The words are the operator's

Whoever is looking at this screen did not build it.

- No command names (never show the operator a string like `pi login`)
- Never pass through the English a library handed back. Put it in our own words
- Do not classify by product name ("working with applications", not "Docker")
- No jargon. Not "the wall" or "the barrier" but "the isolation"; not "the verb" but "reading and
  writing"

### 4. The answer appears inside the application

Opening Finder or an editor is not an answer. "Open the record", landing on a JSON file, hands
over **where the answer is** rather than the answer. What ran, what it printed, and why it was
stopped, all go on the screen.

The exceptions are files the operator **wrote themselves** (skills, prompts, extensions) and files
they **saved**. Those may be revealed, so they can be edited and moved about.

### 5. Safety is not decided by a table

Do not hand-maintain a list of dangerous commands. **Put what the decision rests on on the screen,
and let the operator decide.** Stop on anything unknown.

## Recording the screen

Only what the operator starts by hand and stops by hand. **Never record on your own initiative.**

A recording stays **on this machine only** (`<userData>/remote-recordings/<server>/`). It goes to
no model and to no customer without being asked for. A password being typed is on the screen too,
so while it is recording there is **a red border and a running time**, so nothing is ever being
kept quietly.

## Credentials

A server's password, a key's passphrase and a model's API key **never leave the main process.**
Not to the renderer, not into a run record, not into a prompt.

## Checking

Report only after `yarn typecheck`, `yarn test` and `yarn build` pass.
Any claim about the screen — a width, a height, what is displayed — is measured by running it
first.
