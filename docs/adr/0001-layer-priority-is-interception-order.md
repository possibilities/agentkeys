# 0001 — Layer priority is interception order, not preference

The order of `LAYERS` is the order a keystroke physically reaches them:
Karabiner's virtual HID driver, then the skhd daemon, then the terminal app,
then tmux inside it, then the editor inside that. Whatever a higher layer
claims never arrives below, so shadow detection, `explain` verdicts, and
`find-available` blocking all derive from this one ordering and nothing may
reorder it by taste.
