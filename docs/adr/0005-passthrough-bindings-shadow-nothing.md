# 0005 — Passthrough bindings shadow nothing

skhd's `* ~` and Ghostty's `text:`/`esc:` actions forward the keystroke
onward instead of consuming it, so everything below still receives the key.
Treating them as interceptions invents conflicts that do not exist, so a
passthrough Binding is reported but never counted as a Shadow.
