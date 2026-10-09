// Tower.app: the tower in a window of its own. It shows the tower's renderers in a WKWebView over the same routes a
// browser tab uses, once the system started apart from it answers; it holds no capability or process of its own. Built
// and opened by `tower app` (src/app.ts), which writes the config it serves into its Info.plist.

import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
