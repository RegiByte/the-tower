// The WebKit side of `tool:webkit` (scripts/webkit.ts): a WKWebView, as Tower.app has, in an invisible window, that
// loads a URL and runs the steps it is given in order, printing each result. Events are real AppKit events sent to the
// web view, so a click gives the user activation a synthetic `click()` doesn't.

import AppKit
import WebKit

final class Delegate: NSObject, WKNavigationDelegate, WKUIDelegate {
  var loaded: (() -> Void)?

  func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    let frame = action.targetFrame.map { $0.isMainFrame ? "main" : "frame" } ?? "new"
    if action.navigationType == .linkActivated || frame == "main" && loaded == nil {
      print("navigate \(frame) \(action.request.url?.absoluteString ?? "")")
    }
    decisionHandler(.allow)
  }

  func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
    loaded?()
    loaded = nil
  }

  func webView(_ web: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    print("open window \(action.request.url?.absoluteString ?? "")")
    return nil
  }
}

let args = Array(CommandLine.arguments.dropFirst())
let size = args.firstIndex(of: "--size").map { args[$0 + 1].split(separator: "x").compactMap { Double($0) } } ?? [1280, 800]
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: size[0], height: size[1]), styleMask: [.titled], backing: .buffered, defer: false)
window.alphaValue = 0
let web = WKWebView(frame: window.contentView!.bounds, configuration: WKWebViewConfiguration())
let delegate = Delegate()
web.navigationDelegate = delegate
web.uiDelegate = delegate
window.contentView!.addSubview(web)
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(web)

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
  exit(1)
}

/** The steps after the URL, `--size` taken out: each a flag and its value. */
let steps: [(String, String)] = {
  var rest = Array(args.dropFirst())
  if let at = rest.firstIndex(of: "--size") { rest.removeSubrange(at...at + 1) }
  guard rest.count % 2 == 0 else { fail("every step is a flag and its value") }
  return stride(from: 0, to: rest.count, by: 2).map { (rest[$0], rest[$0 + 1]) }
}()

func mouse(_ type: NSEvent.EventType, at point: NSPoint) -> NSEvent {
  NSEvent.mouseEvent(with: type, location: web.convert(point, to: nil), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!
}

/** The Mac's virtual key codes, which WebKit reads a key's `code` from: a US layout's letters, digits and the keys named. */
let keyCodes: [String: UInt16] = {
  let row = "asdfhgzxcv\u{0}bqweryt123465=97-80]ou[ip\u{0}lj'k;\\,/nm.\u{0}\u{0}`"
  var codes = [String: UInt16]()
  for (i, c) in row.enumerated() where c != "\u{0}" { codes[String(c)] = UInt16(i) }
  return codes.merging(["enter": 36, "tab": 48, "space": 49, "backspace": 51, "escape": 53, "arrowleft": 123, "arrowright": 124, "arrowdown": 125, "arrowup": 126]) { $1 }
}()

/** A chord as `drive` writes one: a key with any of Meta+, Ctrl+, Alt+, Shift+ before it. */
func press(_ chord: String) {
  var parts = chord.split(separator: "+", omittingEmptySubsequences: false).map(String.init)
  let key = parts.removeLast()
  let names: [String: NSEvent.ModifierFlags] = ["Meta": .command, "Ctrl": .control, "Alt": .option, "Shift": .shift]
  let flags = parts.reduce(into: NSEvent.ModifierFlags()) { flags, name in
    guard let flag = names[name] else { fail("unknown modifier \(name)") }
    flags.insert(flag)
  }
  let special: [String: String] = ["Escape": "\u{1b}", "Enter": "\r", "Tab": "\t", "Space": " ", "Backspace": "\u{7f}"]
  let chars = special[key] ?? key
  guard let code = keyCodes[key.lowercased()] else { fail("no key code for \(key)") }
  for type in [NSEvent.EventType.keyDown, .keyUp] {
    let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars, isARepeat: false, keyCode: code)!
    if type == .keyUp { web.keyUp(with: event) } else if flags.contains(.command), web.performKeyEquivalent(with: event) {} else { web.keyDown(with: event) }
  }
}

func run(_ i: Int) {
  guard i < steps.count else { exit(0) }
  let (flag, value) = steps[i]
  let next = { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { run(i + 1) } }
  switch flag {
  case "--eval":
    web.callAsyncJavaScript("return JSON.stringify(await (async () => (\(value)))())", arguments: [:], in: nil, in: .page) { result in
      switch result {
      case .success(let out): print("eval \(value)\n  \(out as? String ?? "undefined")")
      case .failure(let err): fail("eval \(value)\n  threw \(err)")
      }
      next()
    }
  case "--click":
    let xy = value.split(separator: ",").compactMap { Double($0) }
    guard xy.count == 2 else { fail("--click takes x,y in the page's CSS pixels") }
    web.mouseDown(with: mouse(.leftMouseDown, at: NSPoint(x: xy[0], y: xy[1])))
    web.mouseUp(with: mouse(.leftMouseUp, at: NSPoint(x: xy[0], y: xy[1])))
    next()
  case "--key":
    press(value)
    next()
  case "--wait":
    guard let ms = Double(value) else { fail("--wait takes milliseconds") }
    DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000) { run(i + 1) }
  case "--shot":
    web.takeSnapshot(with: nil) { image, err in
      guard let image, let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { fail("--shot failed: \(String(describing: err))") }
      do { try png.write(to: URL(fileURLWithPath: value)) } catch { fail("--shot \(value): \(error)") }
      print("shot \(value)")
      next()
    }
  default:
    fail("unknown step \(flag)")
  }
}

guard let url = args.first.flatMap(URL.init(string:)) else { fail("usage: webkit <url> [--size WxH] step…") }
delegate.loaded = { run(0) }
web.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 120) { fail("timed out after 120 s") }
app.run()
