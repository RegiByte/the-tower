// Tower.app: the tower in a window of its own. It starts the system the way `tower up` does, then shows the tower's
// renderers in a WKWebView over the same routes a browser tab uses; it holds no capability of its own. Built and opened
// by `tower app` (src/app.ts), which writes the checkout and the config it serves into its Info.plist.

import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
